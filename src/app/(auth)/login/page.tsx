import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDemoAccounts, getDemoSession } from "@/lib/demo-auth";

export default async function LoginPage() {
  const session = await getDemoSession();
  if (session) {
    redirect("/dashboard");
  }

  const demoAccounts = getDemoAccounts();

  return (
    <main className="mx-auto flex min-h-[calc(100vh-76px)] max-w-7xl items-center px-6 py-12">
      <div className="grid w-full gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="bg-white/5">
          <CardHeader>
            <CardTitle>Social login and demo access</CardTitle>
            <CardDescription>Use Supabase social auth in production, or use the built-in local plan accounts without touching the database.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action="/api/auth/demo-login" method="post" className="space-y-4">
              <Input name="email" type="email" placeholder="Email" required />
              <Input name="password" type="password" placeholder="Password" required />
              <Button className="w-full" type="submit">
                Login with demo credentials
              </Button>
            </form>

            <div className="grid gap-3 sm:grid-cols-2">
              <a href="/api/auth/social?provider=google">
                <Button variant="outline" className="w-full">
                  Continue with Google
                </Button>
              </a>
              <a href="/api/auth/social?provider=github">
                <Button variant="outline" className="w-full">
                  Continue with GitHub
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5">
          <CardHeader>
            <CardTitle>Built-in plan accounts</CardTitle>
            <CardDescription>These are local cookie-based demo accounts so you can inspect each plan tier before wiring Supabase users.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {demoAccounts.map((account) => (
              <div key={account.email} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-medium">{account.name}</p>
                  <Badge>{account.plan}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{account.email}</p>
                <p className="mt-1 text-sm text-muted-foreground">{account.password}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
