import { redirect } from "next/navigation";

// The menu moved to the home screen; keep old links working.
export default function Order() {
  redirect("/");
}
