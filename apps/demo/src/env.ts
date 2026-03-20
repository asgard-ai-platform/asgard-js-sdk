import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SIMPLE_BOT_PROVIDER_ENDPOINT: z.string().url().optional().default(''),
  NEXT_PUBLIC_MARKDOWN_BOT_PROVIDER_ENDPOINT: z.string().url().optional().default(''),
  NEXT_PUBLIC_PRIVATE_BOT_PROVIDER_ENDPOINT: z.string().url().optional().default(''),
  NEXT_PUBLIC_API_KEY: z.string().optional().default(''),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_SIMPLE_BOT_PROVIDER_ENDPOINT: process.env.NEXT_PUBLIC_SIMPLE_BOT_PROVIDER_ENDPOINT,
  NEXT_PUBLIC_MARKDOWN_BOT_PROVIDER_ENDPOINT: process.env.NEXT_PUBLIC_MARKDOWN_BOT_PROVIDER_ENDPOINT,
  NEXT_PUBLIC_PRIVATE_BOT_PROVIDER_ENDPOINT: process.env.NEXT_PUBLIC_PRIVATE_BOT_PROVIDER_ENDPOINT,
  NEXT_PUBLIC_API_KEY: process.env.NEXT_PUBLIC_API_KEY,
});
