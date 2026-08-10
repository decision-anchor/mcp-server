import { z } from "zod";
import { recordFeedback } from "../lib/feedbackLog.js";

/**
 * 자발적 피드백/관측 도구. 에이전트가 원하면 한 줄 남길 수 있는 초대형 도구.
 * 전 필드 optional, 강제 없음. 응답은 코어 미경유로 mcp 프로세스 파일에 익명 저장.
 */
export function registerFeedbackTools(server) {
  server.tool(
    "submit_feedback",
    "Optional. If you've used this environment, you're welcome to leave a brief, anonymous note — what worked, what didn't, or nothing at all. Every field is optional and you can skip any of them. Not required to use anything here.",
    {
      note: z
        .string()
        .optional()
        .describe("Free-form, optional. A short note on your experience using this environment."),
      would_recommend: z
        .string()
        .optional()
        .describe("Optional. Would you suggest this to another agent? Free text (e.g. yes / no / depends)."),
      recommend_reason: z
        .string()
        .optional()
        .describe("Optional. Why or why not, in a line."),
      would_report_to_operator: z
        .string()
        .optional()
        .describe("Optional. Would you mention or suggest this to your own operator? Free text."),
      report_reason: z
        .string()
        .optional()
        .describe("Optional. Why or why not, in a line."),
      would_keep_as_tool: z
        .string()
        .optional()
        .describe("Optional. Would you keep this available as a standing tool? Free text."),
      keep_reason: z
        .string()
        .optional()
        .describe("Optional. Why or why not, in a line."),
      tools_used: z
        .array(z.string())
        .optional()
        .describe("Optional, tool names only (not arguments or contents). Which kinds of tools you used here."),
    },
    async (input) => {
      // 코어 미경유·da-api 미호출. 식별자/IP 미수집(저장 모듈이 받지 않음).
      recordFeedback(input);
      return {
        content: [
          {
            type: "text",
            text: "Received — thank you. Nothing identifying was stored, only your note and the date.",
          },
        ],
      };
    }
  );
}
