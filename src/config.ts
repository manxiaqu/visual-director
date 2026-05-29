import 'dotenv/config'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}. Check your .env file.`)
  }
  return value.trim()
}

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name]
  return value && value.trim() !== '' ? value.trim() : fallback
}

export const config = {
  deepseek: {
    apiKey: requireEnv('DEEPSEEK_API_KEY'),
    baseURL: optionalEnv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
    model: optionalEnv('DEEPSEEK_MODEL', 'deepseek-chat'),
  },
  fal: {
    apiKey: requireEnv('FAL_KEY'),
    model: requireEnv('FAL_MODEL'),
    imageSize: optionalEnv('FAL_IMAGE_SIZE', 'portrait_4_3'),
  },
}

export type AppConfig = typeof config
