import { useEffect, useRef } from "react";
import { useOfficeStore } from "@/store/office-store";

/**
 * requestAnimationFrame 루프로 매 프레임 tickMovement를 호출한다.
 * FloorPlan 등 최상위 오피스 뷰 컴포넌트에서 한 번만 사용할 것.
 */
export function useMovementLoop(): void {
  const tickMovement = useOfficeStore((s) => s.tickMovement);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let active = true;

    const loop = () => {
      if (!active) return;
      tickMovement();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tickMovement]);
}
