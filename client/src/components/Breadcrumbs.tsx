import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getBreadcrumbTrail } from "../utils/breadcrumbs";
import "./Breadcrumbs.css";

export default function Breadcrumbs() {
  const { user } = useAuth();
  const location = useLocation();
  const trail = getBreadcrumbTrail(location.pathname, user?.role);

  if (trail.length === 0) return null;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {trail.map((item, index) => {
        const isLast = index === trail.length - 1;
        return (
          <span className="breadcrumbs__item" key={`${item.label}-${index}`}>
            {item.to && !isLast ? (
              <Link to={item.to} className="breadcrumbs__link">
                {item.label}
              </Link>
            ) : (
              <span className="breadcrumbs__current" aria-current={isLast ? "page" : undefined}>
                {item.label}
              </span>
            )}
            {!isLast && <span className="breadcrumbs__sep">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
