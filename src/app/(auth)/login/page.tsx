import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in — Insurance Agent Platform" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const { registered } = await searchParams;
  return <LoginForm registered={registered === "1"} />;
}
