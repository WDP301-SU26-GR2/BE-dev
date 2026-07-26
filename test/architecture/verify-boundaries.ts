import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const MODULES_ROOT = path.resolve('src/modules')
const failures: string[] = []

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : [target]
  })
}

function relative(file: string): string {
  return path.relative(process.cwd(), file).replaceAll('\\', '/')
}

for (const file of walk(MODULES_ROOT).filter((candidate) => candidate.endsWith('.service.ts'))) {
  const sourceText = fs.readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true)
  const lineCount = sourceFile.getLineAndCharacterOfPosition(sourceFile.end).line + 1

  if (lineCount > 200) failures.push(`${relative(file)} has ${lineCount} lines (maximum 200)`)

  sourceFile.forEachChild((node) => {
    if (!ts.isClassDeclaration(node)) return
    for (const member of node.members) {
      if (ts.isConstructorDeclaration(member) && member.parameters.length > 6) {
        failures.push(
          `${relative(file)}:${sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1} ` +
            `injects ${member.parameters.length} dependencies (maximum 6)`
        )
      }
    }
  })

  const consumerModule = relative(file).split('/')[2]
  sourceFile.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return
    const match = node.moduleSpecifier.text.match(/^src\/modules\/([^/]+)\/.*(?:\.repo|\/repositories\/[^/]+)$/)
    if (match && match[1] !== consumerModule) {
      failures.push(`${relative(file)} imports repository from module ${match[1]}`)
    }
  })
}

for (const file of walk(MODULES_ROOT).filter((candidate) => candidate.endsWith('.controller.ts'))) {
  const sourceText = fs.readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true)

  sourceFile.forEachChild((node) => {
    if (!ts.isClassDeclaration(node)) return
    for (const member of node.members) {
      if (ts.isConstructorDeclaration(member) && member.parameters.length > 1) {
        failures.push(
          `${relative(file)}:${sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1} ` +
            `injects ${member.parameters.length} dependencies (controllers may inject only one orchestrator)`
        )
      }
    }
  })
}

for (const file of walk(MODULES_ROOT).filter((candidate) => candidate.endsWith('.module.ts'))) {
  const sourceText = fs.readFileSync(file, 'utf8')
  if (/\bPrismaService\b/.test(sourceText)) {
    failures.push(`${relative(file)} registers or imports PrismaService in a feature module`)
  }
}

if (failures.length > 0) {
  console.error(`Architecture boundary verification failed:\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log('Architecture boundary verification passed')
}
