import { useState, useEffect } from "react";
import { todayIso } from "../utils";

export function useTodayDate() {
  const [today, setToday] = useState(todayIso);

  useEffect(() => {
    function checkDate() {
      const current = todayIso();
      if (current !== today) {
        setToday(current);
      }
    }

    const intervalId = setInterval(checkDate, 60000);
    window.addEventListener("visibilitychange", checkDate);
    window.addEventListener("focus", checkDate);
    checkDate();

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("visibilitychange", checkDate);
      window.removeEventListener("focus", checkDate);
    };
  }, [today]);

  return today;
}
