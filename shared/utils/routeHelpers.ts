import env from "../env";

export function signin(service = "slack"): string {
  return `${env.BASE_URL}/auth/${service}`;
}

export function integrationSettingsPath(id: string): string {
  return `${env.BASE_URL}/settings/integrations/${id}`;
}
