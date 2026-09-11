import type { ComponentType, SVGProps } from "react";
import "./StatCard.css";

interface StatCardProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone: "blue" | "red" | "amber" | "green";
  label: string;
  value: string | number;
}

export default function StatCard({ icon: Icon, tone, label, value }: StatCardProps) {
  return (
    <div className={`card stat-card stat-card--${tone}`}>
      <div className="stat-card__icon">
        <Icon />
      </div>
      <div>
        <div className="stat-card__label">{label}</div>
        <div className="stat-card__value">{value}</div>
      </div>
    </div>
  );
}
