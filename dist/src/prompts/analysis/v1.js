export const ANALYSIS_PROMPT_VERSION = "v1";
export function buildAnalysisPrompt(input) {
    return `Research analysis for blog topic: "${input.topic}".

v=${ANALYSIS_PROMPT_VERSION}
Use ONLY these sources. Extract facts, stats, arguments, examples, viewpoints, terminology, quotes, and claims needing verification.

Rules:
- every claim must use real sourceIds from the list
- never invent IDs/URLs
- if unsure, lower confidence and use category verification_needed

Sources: ${input.sourcesJson}

Return JSON only:
{"summary":string,"claims":[{"claim":string,"sourceIds":string[],"confidence":number,"category":string}],"keyArguments":string[],"competingViewpoints":string[],"terminology":string[],"sourceRelationships":[{"sourceIds":string[],"relationship":string}]}`;
}
