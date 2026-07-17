export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong password or corrupted vault (authentication failed)')
    this.name = 'WrongPasswordError'
  }
}

export class VaultNotFoundError extends Error {
  constructor(location: string) {
    super(`Vault not found at ${location}. Run \`key init\` to create one.`)
    this.name = 'VaultNotFoundError'
  }
}

export class VaultExistsError extends Error {
  constructor(location: string) {
    super(`A vault already exists at ${location}.`)
    this.name = 'VaultExistsError'
  }
}
