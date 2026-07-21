// Dispatches the .env-style line-preserving parser/patcher to use by file
// extension, so `apply`/`diff`/`scan` work the same way against .properties,
// .yaml/.yml and .toml files as they already do against .env.
import {
  appendEnvVar,
  listEnvVars,
  parseEnvEntries,
  setEnvValue,
} from './env-file.ts'
import * as propertiesFile from './properties-file.ts'
import * as tomlFile from './toml-file.ts'
import * as yamlFile from './yaml-file.ts'

export interface VarEntry {
  name: string
  lineIndex: number
}

export interface Entry {
  name: string
  value: string
}

export interface SetValueResult {
  content: string
  found: boolean
}

export interface ConfigFormat {
  listVars(content: string): VarEntry[]
  parseEntries(content: string): Entry[]
  setValue(content: string, name: string, value: string): SetValueResult
  appendVar(content: string, name: string, value: string): string
}

const dotEnvFormat: ConfigFormat = {
  listVars: listEnvVars,
  parseEntries: parseEnvEntries,
  setValue: setEnvValue,
  appendVar: appendEnvVar,
}

const FORMATS: Record<string, ConfigFormat> = {
  properties: propertiesFile,
  yaml: yamlFile,
  yml: yamlFile,
  toml: tomlFile,
}

// Anything without a recognized extension (including plain ".env") falls
// back to the original .env dialect — that stays the default.
export function formatFor(path: string): ConfigFormat {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return FORMATS[ext] ?? dotEnvFormat
}
