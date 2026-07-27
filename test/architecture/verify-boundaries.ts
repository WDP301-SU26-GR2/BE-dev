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

      // Handler "chết": method được trang trí như một route (@ApiOperation/@ZodResponse/@IsPublic/
      // @Roles/@ApiErrors) nhưng THIẾU @Get/@Post/... ⇒ Nest không map, code không bao giờ chạy,
      // mà mọi assertion kiểu Reflect.getMetadata trong spec vẫn "xanh" → bảo đảm giả.
      // Đã xảy ra thật: 4 handler public của SurveyController bị nhân bản sang PublicRankingController
      // nhưng bản gốc không được xoá (phát hiện + dọn 2026-07-27).
      // Helper thường (vd `private actor(...)`) không có decorator nào nên không dính guard này.
      if (!ts.isMethodDeclaration(member)) continue
      const decorators = ts.getDecorators(member) ?? []
      if (decorators.length === 0) continue
      const decoratorNames = decorators.map((decorator) => {
        const expression = ts.isCallExpression(decorator.expression)
          ? decorator.expression.expression
          : decorator.expression
        return expression.getText(sourceFile)
      })
      const HTTP_METHOD_DECORATORS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'All', 'Head', 'Options']
      const ROUTE_SHAPED_DECORATORS = ['ApiOperation', 'ZodResponse', 'IsPublic', 'Roles', 'ApiErrors', 'ApiResponse']
      const hasHttpMethod = decoratorNames.some((name) => HTTP_METHOD_DECORATORS.includes(name))
      const looksLikeRoute = decoratorNames.some((name) => ROUTE_SHAPED_DECORATORS.includes(name))
      if (looksLikeRoute && !hasHttpMethod) {
        failures.push(
          `${relative(file)}:${sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1} ` +
            `${member.name.getText(sourceFile)} is decorated like a route but has no HTTP method decorator ` +
            `(dead handler — Nest never maps it)`
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
