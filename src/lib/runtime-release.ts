export const fluxpostRuntimeModes = ["development", "local-production", "production"] as const;

export type FluxPostRuntimeMode = (typeof fluxpostRuntimeModes)[number];

export type RuntimeReleaseIdentity = {
  commit: string | null;
  mode: FluxPostRuntimeMode;
  versioned: boolean;
};

export class RuntimeReleaseIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeReleaseIdentityError";
  }
}

export function resolveRuntimeReleaseIdentity(
  environment: Record<string, string | undefined> = process.env,
): RuntimeReleaseIdentity {
  const rawMode = environment.FLUXPOST_RUNTIME_MODE || "development";
  if (!isRuntimeMode(rawMode)) {
    throw new RuntimeReleaseIdentityError("FLUXPOST_RUNTIME_MODE is invalid");
  }

  const rawCommit = environment.FLUXPOST_RELEASE_SHA;
  if (!rawCommit) {
    if (rawMode !== "development") {
      throw new RuntimeReleaseIdentityError("FLUXPOST_RELEASE_SHA is required for versioned runtimes");
    }
    return { commit: null, mode: rawMode, versioned: false };
  }
  if (!/^[0-9a-f]{40}$/.test(rawCommit)) {
    throw new RuntimeReleaseIdentityError("FLUXPOST_RELEASE_SHA must be a full lowercase Git commit");
  }
  return { commit: rawCommit, mode: rawMode, versioned: true };
}

function isRuntimeMode(value: string): value is FluxPostRuntimeMode {
  return fluxpostRuntimeModes.some((mode) => mode === value);
}
