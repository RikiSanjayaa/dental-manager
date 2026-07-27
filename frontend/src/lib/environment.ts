const appEnvironment = import.meta.env.VITE_APP_ENV?.trim().toLowerCase() || (import.meta.env.DEV ? "development" : "production");

export const isDevelopmentEnvironment = import.meta.env.DEV && ["dev", "development", "local", "test"].includes(appEnvironment);

export const environmentLabel = appEnvironment;
