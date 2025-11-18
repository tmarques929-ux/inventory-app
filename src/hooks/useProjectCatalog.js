import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { projectDefinitions as legacyDefinitions } from "../data/dispenserComponents";

const normalizeString = (value) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const extractBoardCode = (metadata = {}, row = {}) => {
  const candidates = [
    metadata.finishedBoardCode,
    metadata.finished_board_code,
    metadata.boardCode,
    metadata.board_code,
    metadata.finishedBoardId,
    metadata.finished_board_id,
    row.finishedBoardCode,
    row.finished_board_code,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeString(candidate);
    if (normalized) return normalized;
  }
  return "-";
};

const parseProjectValue = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object") {
    const amount = value.amount ?? value.valor ?? value.value;
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeRemoteProject = (row) => {
  if (!row || typeof row !== "object") return null;
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const idCandidates = [
    normalizeString(row.id),
    normalizeString(metadata.id),
    normalizeString(metadata.slug),
    normalizeString(metadata.finishedBoardCode),
  ];
  const id = idCandidates.find((candidate) => candidate) || `project-${Date.now()}`;

  const nameCandidates = [
    normalizeString(row.name),
    normalizeString(metadata.name),
    normalizeString(metadata.projectName),
    normalizeString(metadata.title),
    normalizeString(metadata.nome),
  ];
  const name = nameCandidates.find((candidate) => candidate) || "Projeto sem nome";

  const customerCandidates = [
    normalizeString(metadata.customer),
    normalizeString(metadata.cliente),
    normalizeString(row.customer),
  ];
  const customer = customerCandidates.find((candidate) => candidate) || null;

  return {
    id,
    name,
    customer,
    finishedBoardCode: extractBoardCode(metadata, row),
    defaultValue: parseProjectValue(metadata.projectValue ?? row.projectValue),
  };
};

const sortProjects = (list) =>
  list.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

export function useProjectCatalog() {
  const [projects, setProjects] = useState(() => sortProjects(legacyDefinitions));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadProjects = async () => {
      setLoading(true);
      try {
        const { data, error: fetchError } = await supabase
          .from("projetos_config")
          .select("id, name, metadata");
        if (fetchError) throw fetchError;

        const remoteProjects = (data ?? [])
          .map(normalizeRemoteProject)
          .filter(Boolean)
          .map((project) => ({
            ...project,
            // Garantir que finishedBoardCode sempre tenha algo amigável.
            finishedBoardCode:
              normalizeString(project.finishedBoardCode) || project.name || project.id,
          }));

        const mergedMap = new Map();
        sortProjects(legacyDefinitions).forEach((project) =>
          mergedMap.set(project.id, project),
        );
        remoteProjects.forEach((project) => mergedMap.set(project.id, project));

        if (isMounted) {
          setProjects(sortProjects(Array.from(mergedMap.values())));
          setError(null);
        }
      } catch (err) {
        console.error("Erro ao carregar projetos configurados", err);
        if (isMounted) {
          setError(err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadProjects();
    return () => {
      isMounted = false;
    };
  }, []);

  return useMemo(
    () => ({
      projects,
      loading,
      error,
    }),
    [projects, loading, error],
  );
}
