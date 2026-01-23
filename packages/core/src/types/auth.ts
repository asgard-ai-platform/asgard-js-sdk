export type AuthState =
  | 'loading'
  | 'needApiKey'
  | 'authenticated'
  | 'error'
  | 'invalidApiKey'
  | 'subscriptionExpired'
  | 'botNotFound';
