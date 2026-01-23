export type AuthState =
  | 'loading'
  | 'needApiKey'
  | 'authenticated'
  | 'error'
  | 'invalidApiKey'
  | 'serviceUnavailable'
  | 'botNotFound';
