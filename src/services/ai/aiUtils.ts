/**
 * AI 服务共享工具模块
 * 提取公共方法避免重复代码
 */

import { METADATA_SYSTEM_PROMPT } from './systemPrompt';

/**
 * 修复常见的 AI 输出 JSON 格式错误
 * @param content 原始 AI 输出内容
 * @returns 修复后的 JSON 字符串
 */
export function repairJson(content: string): string {
    let repaired = content;
    let repairsMade: string[] = [];

    // 1. 移除无效的 Unicode 字符（乱码）
    const originalLength = repaired.length;
    repaired = repaired.replace(/[\uFFFD\u0000-\u001F]/g, '');
    if (repaired.length !== originalLength) {
        repairsMade.push('Removed invalid Unicode characters');
    }

    // 2. 修复圆括号被误写为花括号/方括号的问题
    let parenFixes = 0;
    repaired = repaired.replace(/"scene_tag"\s*:\s*"[^"]*"\s*\)/g, (match) => {
        parenFixes++;
        return match.slice(0, -1) + '}';
    });
    if (parenFixes > 0) {
        repairsMade.push(`Fixed ${parenFixes} parentheses used instead of braces`);
    }

    // 3. 修复 scene_tag 后面使用 ] 而不是 } 的问题
    let bracketCount = 0;
    repaired = repaired.replace(/"scene_tag"\s*:\s*"[^"]*"\s*\]/g, (match) => {
        bracketCount++;
        return match.slice(0, -1) + '}';
    });
    if (bracketCount > 0) {
        repairsMade.push(`Fixed ${bracketCount} mismatched brackets after scene_tag`);
    }

    // 4. 修复 embedding_tags 整体使用 ] 闭合而不是 } 的问题
    let embeddingFixes = 0;
    repaired = repaired.replace(/(\],\s*"language")/g, (match) => {
        embeddingFixes++;
        return '},' + match.slice(2);
    });
    if (embeddingFixes > 0) {
        repairsMade.push(`Fixed ${embeddingFixes} embedding_tags closure issues`);
    }

    // 5. 修复 embedding_tags 对象提前关闭导致后续字段脱离的问题
    let earlyClosureFixes = 0;
    repaired = repaired.replace(/\}\s*,\s*\{\s*"language"/g, () => {
        earlyClosureFixes++;
        return '},"language"';
    });
    if (earlyClosureFixes > 0) {
        repairsMade.push(`Fixed ${earlyClosureFixes} early object closures`);
    }

    // 6. 修复 vector_anchor 被扁平化为字符串的问题
    const vectorAnchorFlatPattern = /"vector_anchor"\s*:\s*"([^"]+)"/g;
    const vectorAnchorFix = repaired.replace(vectorAnchorFlatPattern, (match, textContent) => {
        repairsMade.push('Converted flattened vector_anchor to object');
        return `"vector_anchor":{"acoustic_model":"${textContent}","semantic_push":"[Auto-repaired: data was flattened]","cultural_weight":"[Auto-repaired: data was flattened]"}`;
    });
    if (vectorAnchorFix !== repaired) {
        repaired = vectorAnchorFix;
    }

    // 7. 修复末尾可能缺少的 ] 
    const trimmed = repaired.trim();
    if (trimmed.startsWith('[') && !trimmed.endsWith(']')) {
        const lastBrace = repaired.lastIndexOf('}');
        if (lastBrace > 0) {
            repaired = repaired.slice(0, lastBrace + 1) + ']';
            repairsMade.push('Added missing closing bracket');
        }
    }

    // 8. 修复连续的逗号和尾随逗号
    repaired = repaired.replace(/,\s*,/g, ',');
    repaired = repaired.replace(/,\s*\]/g, ']');
    repaired = repaired.replace(/,\s*\}/g, '}');

    if (repairsMade.length > 0) {
        console.log(`[AI Utils] JSON Repairs Applied: ${repairsMade.join(', ')}`);
    }

    return repaired;
}

/**
 * 写入 AI 错误日志文件
 */
export async function writeErrorLog(options: {
    serviceName: string;
    modelName: string;
    error: Error;
    userPrompt: string;
    rawResponse: string;
}): Promise<void> {
    const { serviceName, modelName, error, userPrompt, rawResponse } = options;

    try {
        const fs = await import('fs');
        const path = await import('path');
        const logDir = path.join(process.cwd(), 'logs');

        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const prefix = serviceName.toLowerCase().replace('service', '');
        const logFileName = `${prefix}-error-${timestamp}.log`;
        const logPath = path.join(logDir, logFileName);

        const logContent = `
========================================
${serviceName.toUpperCase()} Error Log - ${new Date().toISOString()}
========================================

[Model]: ${modelName}

[Error Message]: ${error.message}

[Error Stack]: 
${error.stack || 'N/A'}

========================================
SYSTEM PROMPT
========================================
${METADATA_SYSTEM_PROMPT}

========================================
USER PROMPT (Input Songs)
========================================
${userPrompt}

========================================
AI RAW RESPONSE (This is what caused the error)
========================================
${rawResponse}

========================================
END OF LOG
========================================
`;

        fs.writeFileSync(logPath, logContent, 'utf-8');
        console.error(`[${serviceName}] Error log saved to: ${logPath}`);
    } catch (logError) {
        console.error(`[${serviceName}] Failed to write error log:`, logError);
    }
}

/**
 * 清理 Markdown 代码块标记
 */
export function cleanMarkdown(content: string): string {
    return content.replace(/```json/g, '').replace(/```/g, '').trim();
}

/**
 * 调试日志：打印 AI 请求信息
 */
export function logAIRequest(serviceName: string, modelName: string, systemPromptPreview: string, userPrompt: string): void {
    console.log(`\n========== [${serviceName}] Batch Metadata Generation Debug ==========`);
    console.log(`[${serviceName}] Model: ${modelName}`);
    console.log(`[${serviceName}] System Prompt (first 500 chars):\n${systemPromptPreview.substring(0, 500)}...`);
    console.log(`[${serviceName}] User Prompt:\n${userPrompt}`);
    console.log('='.repeat(70) + '\n');
}

/**
 * 调试日志：打印 AI 响应
 */
export function logAIResponse(serviceName: string, rawContent: string): void {
    console.log(`\n========== [${serviceName}] AI Raw Response ==========`);
    console.log(rawContent);
    console.log('='.repeat(55) + '\n');
}
