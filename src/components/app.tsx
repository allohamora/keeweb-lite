import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Toaster } from '@/components/ui/sonner';
import { UnlockPage } from '@/components/unlock.page';
import { useSessionStore } from '@/services/session.service';

export const App = () => {
  const clearSession = useSessionStore((state) => state.clearSession);
  const session = useSessionStore((state) => state.session);

  return (
    <>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        {!session ? (
          <UnlockPage />
        ) : (
          <Card className="mx-auto mt-8 w-full max-w-4xl">
            <CardHeader className="gap-2 border-b pb-3">
              <CardTitle>{session.recordName}</CardTitle>
              <CardDescription>Workspace placeholder. Unlock session is active.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <p className="text-xs text-muted-foreground">
                Source: {session.recordType === 'google-drive' ? 'Google Drive' : 'Local'}
              </p>
              <p className="text-xs text-muted-foreground">
                Unlocked at: {new Date(session.unlockedAt).toLocaleString()}
              </p>
              <Button onClick={clearSession} type="button" variant="outline">
                Lock
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
      <Toaster />
    </>
  );
};
