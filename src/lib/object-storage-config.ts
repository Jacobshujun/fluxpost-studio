export type ObjectStorageConfig = {
  provider: "tos" | "oss";
  enabled: boolean;
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint: string;
  region: string;
  publicBaseUrl: string;
  objectPrefix: string;
};

type StorageFields = Omit<ObjectStorageConfig, "provider">;
type StorageSettings = { runtimeStorageProvider: string } & {
  [K in keyof StorageFields as `tos${Capitalize<K>}`]: StorageFields[K];
} & {
  [K in keyof StorageFields as `oss${Capitalize<K>}`]: StorageFields[K];
};

export function selectObjectStorageConfig(settings: StorageSettings): ObjectStorageConfig {
  const provider = settings.runtimeStorageProvider;
  if (provider !== "tos" && provider !== "oss") throw new Error("Invalid runtime storage provider; expected tos or oss.");
  return {
    provider,
    enabled: settings[`${provider}Enabled`],
    accessKeyId: settings[`${provider}AccessKeyId`],
    accessKeySecret: settings[`${provider}AccessKeySecret`],
    bucket: settings[`${provider}Bucket`],
    endpoint: settings[`${provider}Endpoint`],
    region: settings[`${provider}Region`],
    publicBaseUrl: settings[`${provider}PublicBaseUrl`],
    objectPrefix: settings[`${provider}ObjectPrefix`],
  };
}

export function isObjectStorageConfigured(settings: StorageSettings) {
  const config = selectObjectStorageConfig(settings);
  return Boolean(config.accessKeyId && config.accessKeySecret && config.bucket &&
    config.endpoint && config.region && config.publicBaseUrl);
}
