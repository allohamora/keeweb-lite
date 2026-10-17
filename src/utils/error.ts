export const getErrorMessage = ({ error, fallback }: { error: unknown; fallback: string }) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};
