import { Button } from "@acme/ui/Button";
import { formatLabel } from "@acme/utils";
import { formatAlias } from "@/helpers/label";
import { formatPseudoExt } from "@/helpers/common.util";
import styles from "./styles.module.css";
import messages from "./locales/en.json";
import logo from "./assets/logo.svg";

export function App() {
  formatLabel();
  formatAlias();
  formatPseudoExt();
  void styles;
  void messages;
  void logo;
  return <Button />;
}
