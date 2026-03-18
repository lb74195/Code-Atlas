import { Button } from "@acme/ui/Button";
import { formatLabel } from "@acme/utils";
import { formatAlias } from "@/helpers/label";

export function App() {
  formatLabel();
  formatAlias();
  return <Button />;
}
