import { useTranslation } from "react-i18next";
import { ZONES } from "@/lib/constants";

type ZoneKey = keyof typeof ZONES;

interface ZoneLabelByZoneProps {
  zone: { x: number; y: number; width: number; height: number };
  zoneKey: ZoneKey;
}

interface ZoneLabelByPositionProps {
  x: number;
  y: number;
  label: string;
}

type ZoneLabelProps = ZoneLabelByZoneProps | ZoneLabelByPositionProps;

function isByZone(props: ZoneLabelProps): props is ZoneLabelByZoneProps {
  return "zone" in props;
}

export function ZoneLabel(props: ZoneLabelProps) {
  const { t } = useTranslation("common");

  if (isByZone(props)) {
    const { zone, zoneKey } = props;
    const label = t(`zones.${zoneKey}`);
    return (
      <text
        x={zone.x + zone.width / 2}
        y={zone.y + 16}
        textAnchor="middle"
        dominantBaseline="middle"
        className="pointer-events-none select-none"
        fill="currentColor"
        opacity={0.45}
        fontSize={11}
        fontWeight={600}
        fontFamily="system-ui, sans-serif"
        letterSpacing="0.08em"
      >
        {label.toUpperCase()}
      </text>
    );
  }

  const { x, y, label } = props;
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      className="pointer-events-none select-none fill-[var(--color-text-secondary)] text-xs font-medium opacity-60"
    >
      {label}
    </text>
  );
}
