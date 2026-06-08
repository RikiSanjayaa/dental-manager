const appEnvironment = import.meta.env.VITE_APP_ENV?.trim().toLowerCase() || "development";

export const isDevelopmentEnvironment = ["dev", "development", "local", "test"].includes(appEnvironment);

export const environmentLabel = appEnvironment;
