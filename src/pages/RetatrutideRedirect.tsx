import { useEffect } from "react";

const TARGET_URL = "https://bula.pharmaliberty.com/retratutide/";

const RetatrutideRedirect = () => {
  useEffect(() => {
    window.location.replace(TARGET_URL);
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      Redirecionando para{" "}
      <a href={TARGET_URL}>{TARGET_URL}</a>...
    </div>
  );
};

export default RetatrutideRedirect;