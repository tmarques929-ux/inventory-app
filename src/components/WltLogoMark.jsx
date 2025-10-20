import logo from "../assets/wlt-logo.png";

export default function WltLogoMark({ className = "", title = "Logo WLT", ...props }) {
  return (
    <img
      src={logo}
      alt={title}
      className={className}
      loading="lazy"
      draggable={false}
      {...props}
    />
  );
}
