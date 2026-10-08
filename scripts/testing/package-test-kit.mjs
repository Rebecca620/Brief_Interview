import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = '.build/brief-test-kit';
const plan = await readFile(`${root}/START-HERE.zh-CN.md`, 'utf8');
const ids = [...plan.matchAll(/^\|\s*([IEWSRU]\d{2})\s*\|/gm)].map((m) => m[1]);
await writeFile(
  `${root}/TEST-RESULTS.csv`,
  '\uFEFFcase_id,status,environment,actual_result,evidence,issue,severity,tester,date\n' +
    ids.map((id) => `${id},NOT_RUN,,,,,,,`).join('\n') +
    '\n',
);
const manifest = [];
for (const folder of ['valid', 'invalid', 'reference']) {
  for (const name of (await readdir(`${root}/${folder}`)).sort()) {
    const bytes = await readFile(`${root}/${folder}/${name}`);
    manifest.push({
      file: `${folder}/${name}`,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
}
await writeFile(
  `${root}/MANIFEST.json`,
  JSON.stringify(
    {
      created: '2026-09-26',
      syntheticOnly: true,
      manualCases: ids.length,
      fixtureFiles: manifest.length,
      files: manifest,
    },
    null,
    2,
  ),
);
await writeFile(
  `${root}/VERIFICATION.md`,
  `# 本次核验记录\n\n基于 2026-09-26 当前工作区，macOS Chrome 自动化环境。\n\n- 70 项单元/服务端测试通过；lint 与格式检查通过。\n- 全量浏览器测试 50 项通过，1 项私人文件用例跳过；1 项 PNG 生成等待超过5秒，随后图片分享与新导入共7项专项复测全部通过，未修改超时阈值。\n- 新模板的备份恢复、无障碍、桌面居中、手机防溢出和数值金标准另有专项回归通过。\n- 40 个素材文件通过真实浏览器导入模块核验；详细结果在 FIXTURE-VERIFICATION.json。配对重复/无共同键/错误turn_index这些文件在解析阶段合法，错误在选择对应分析模式后产生。\n- Word 样例1页、PDF素材共5页逐页渲染检查；复盘模板打印样例3页已检查，允许分页并保留完整图表与精确数据。\n- 包内 ${manifest.length} 个素材/参考文件，${ids.length} 条人工用例。TEST-RESULTS.csv 默认 NOT_RUN，供你记录真实环境验收；以上自动化记录不等于每条人工用例均已执行。\n- 未实际发送邮件、消息或日历邀请，未调用真实Jev提供商，未部署到公开网站。邮件格式和系统分享需在目标客户端复验。\n\n先读 START-HERE.zh-CN.md 的十分钟验收路径。reference/01-retrospective-backup.json 可直接上传并选择 Open as new report，或通过 Settings 恢复；reference/02-retrospective-preview.html 可直接在浏览器打开。\n`,
);
console.log(`${ids.length} manual cases; ${manifest.length} fixture/reference files.`);
