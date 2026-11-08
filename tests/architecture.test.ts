import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import {resolve, relative, dirname} from 'node:path';
import ts from 'typescript';

const sourceRoot = resolve(import.meta.dirname, '../src');
const allowed: Readonly<Record<string, readonly string[]>> = {
    domain: ['domain'],
    application: ['application', 'domain'],
    infrastructure: ['infrastructure', 'application', 'domain'],
    presentation: ['presentation', 'application', 'domain']
};

test('lightweight DDD layers only import inward through their allowed boundaries', async () => {
    const files = await readdir(sourceRoot, {recursive: true});
    for (const file of files.filter(file => file.endsWith('.ts') && !file.endsWith('.d.ts'))) {
        const layer = file.split(/[\\/]/)[0];
        const permitted = allowed[layer];
        if (!permitted) continue; // main.ts is the composition root.
        const fullPath = resolve(sourceRoot, file);
        const tree = ts.createSourceFile(file, await readFile(fullPath, 'utf8'), ts.ScriptTarget.Latest, true);
        const check = (node: ts.Node): void => {
            if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
                const target = node.moduleSpecifier.text;
                if (target.startsWith('.')) {
                    const targetLayer = relative(sourceRoot, resolve(dirname(fullPath), target)).split(/[\\/]/)[0];
                    assert.ok(permitted.includes(targetLayer), `${file} must not import ${target}`);
                } else {
                    assert.equal(layer, 'infrastructure', `${file} must not depend on a third-party package`);
                }
            }
            if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
                assert.fail(`${file}: dynamic imports must be wired in the composition root`);
            }
            ts.forEachChild(node, check);
        };
        check(tree);
    }
});
