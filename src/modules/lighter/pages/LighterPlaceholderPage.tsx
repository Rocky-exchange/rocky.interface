import { useEffect } from "react";

import "../styles/global.scss";
import { TopNav } from "../components/TopNav/TopNav";
import styles from "./LighterPlaceholderPage.module.scss";

export default function LighterPlaceholderPage({ title }: { title: string }) {
  useEffect(() => {
    document.body.classList.add("lighter-active");
    return () => document.body.classList.remove("lighter-active");
  }, []);

  return (
    <div className={`lighter-root ${styles.page}`}>
      <div className={styles.topnav}>
        <TopNav />
      </div>
      <div className={styles.body}>{title}</div>
    </div>
  );
}
