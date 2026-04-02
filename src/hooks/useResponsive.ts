import { useEffect, useState } from "react";

interface ResponsiveState {
  isMobile: boolean;
  isTablet: boolean;
}

function getState(): ResponsiveState {
  const width = typeof window !== "undefined" ? window.innerWidth : 1024;
  return {
    isMobile: width < 768,
    isTablet: width < 1024,
  };
}

export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>(getState);

  useEffect(() => {
    const handleResize = () => setState(getState());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return state;
}
