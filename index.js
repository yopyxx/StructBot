// index.js (Discord.js v14 + Railway keepalive)

const fs = require("fs");
const path = require("path");
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

// =========================
// Railway Keep-Alive (HTTP)
// =========================
const app = express();
app.get("/", (_, res) => res.status(200).send("OK"));
app.get("/health", (_, res) => res.status(200).json({ ok: true }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[HTTP] Listening on :${PORT}`));

// =========================
// Discord Client
// =========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // 역할 부여/제거에 필요
  ],
});

// =========================
// ENV
// =========================
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error("❌ TOKEN 환경변수가 없습니다. Railway Variables에 TOKEN을 설정하세요.");
  process.exit(1);
}

// =========================
// 1) 특정 사용자에게 모든 권한 부여
// =========================
const OWNER_ID = "942558158436589640";

// =========================
// 역할 자동 업데이트 (요청 2,3)
// =========================
const ROLE_UPDATES = {
  major: {
    add: ["1443933530135461908", "1432005794135802007", "1434909470106058842"],
    remove: ["1432005822237380659"],
  },
  colonel: {
    add: ["1440692062465953884"],
    remove: ["1432005794135802007"],
  },
};

// =========================
// 편제(예시) 데이터 저장
// =========================
const DATA_FILE = path.join(__dirname, "organization.json");

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {
      // 예시 구조
      "재정교육단": [],       // (여기서 대령 편제라고 가정)
      "인사교육단_중령": [],
      "인사교육단_소령": [], // 소령 편제
    };
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("❌ organization.json 파싱 실패:", e);
    // 파일 손상 시 백업 후 초기화(안전장치)
    try {
      fs.copyFileSync(DATA_FILE, DATA_FILE + ".broken_backup");
    } catch {}
    return {
      "재정교육단": [],
      "인사교육단_중령": [],
      "인사교육단_소령": [],
    };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

let org = loadData();

// =========================
// 권한 체크 (OWNER 우회 포함)
// =========================
function isOwner(interaction) {
  return interaction.user?.id === OWNER_ID;
}

// 예시 권한: 서버 관리자 또는 특정 역할 보유 등으로 확장 가능
function hasCommandPermission(interaction) {
  if (isOwner(interaction)) return true;

  // 예시: 관리자 권한 가진 사람만
  const member = interaction.member;
  if (!member) return false;
  // guild member permissions
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;

  return false;
}

// =========================
// 역할 변경 유틸
// =========================
async function applyRoleUpdate(guildMember, update) {
  if (!guildMember || !update) return;

  const toAdd = (update.add || []).filter(Boolean);
  const toRemove = (update.remove || []).filter(Boolean);

  // 이미 있는 역할/없는 역할은 알아서 무시되지만,
  // 불필요 API 호출 줄이려면 현 상태 확인해서 거르는 게 좋음
  const currentRoleIds = new Set(guildMember.roles.cache.map((r) => r.id));

  const addList = toAdd.filter((id) => !currentRoleIds.has(id));
  const removeList = toRemove.filter((id) => currentRoleIds.has(id));

  if (addList.length > 0) await guildMember.roles.add(addList);
  if (removeList.length > 0) await guildMember.roles.remove(removeList);
}

// =========================
// Slash Commands 등록
// =========================
const commands = [
  new SlashCommandBuilder()
    .setName("편제추가")
    .setDescription("재정교육단 또는 인사교육단에 인원을 추가합니다.")
    .addStringOption((opt) =>
      opt
        .setName("부서")
        .setDescription("추가할 부서")
        .setRequired(true)
        .addChoices(
          { name: "재정교육단(대령)", value: "재정교육단" },
          { name: "인사교육단(중령)", value: "인사교육단_중령" },
          { name: "인사교육단(소령)", value: "인사교육단_소령" }
        )
    )
    .addUserOption((opt) =>
      opt.setName("대상").setDescription("대상 멤버").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("닉네임").setDescription("표시 닉네임").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("편제현황")
    .setDescription("현재 편제 현황을 확인합니다."),
].map((c) => c.toJSON());

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    // 전역 커맨드가 아니라 "현재 guild에서만" 쓰고 싶다면 guildId 기반 등록이 더 빠름
    await client.application.commands.set(commands);
    console.log("✅ 슬래시 커맨드 등록 완료");
  } catch (e) {
    console.error("❌ 슬래시 커맨드 등록 실패:", e);
  }
});

// =========================
// Interaction Handler
// =========================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    // 1) OWNER는 모든 명령 권한
    // (명령별로 권한 제한이 있어도 여기서 통과시키면 됨)
    const ownerBypass = isOwner(interaction);

    if (interaction.commandName === "편제추가") {
      if (!ownerBypass && !hasCommandPermission(interaction)) {
        return interaction.reply({ content: "❌ 권한이 없습니다.", ephemeral: true });
      }

      const dept = interaction.options.getString("부서", true);
      const user = interaction.options.getUser("대상", true);
      const nickname = interaction.options.getString("닉네임", true);

      const guild = interaction.guild;
      if (!guild) {
        return interaction.reply({ content: "❌ 길드에서만 사용할 수 있습니다.", ephemeral: true });
      }

      // 대상 멤버 fetch (캐시 누락 대비)
      const targetMember = await guild.members.fetch(user.id);

      // 편제 중복 제거(예시)
      for (const k of Object.keys(org)) {
        org[k] = (org[k] || []).filter((m) => m.id !== user.id);
      }

      org[dept] = org[dept] || [];
      org[dept].push({ id: user.id, nickname });

      saveData(org);

      // 2) 소령 편제 추가 시 역할 업데이트
      if (dept === "인사교육단_소령") {
        await applyRoleUpdate(targetMember, ROLE_UPDATES.major);
      }

      // 3) 대령 편제 추가 시 역할 업데이트
      // 여기서는 "재정교육단(대령)"을 대령 편제로 가정했음
      if (dept === "재정교육단") {
        await applyRoleUpdate(targetMember, ROLE_UPDATES.colonel);
      }

      return interaction.reply({
        content: `✅ ${targetMember} 편제 등록 완료 (${dept})`,
        ephemeral: true,
      });
    }

    if (interaction.commandName === "편제현황") {
      // 현황은 누구나 보게 하려면 권한 체크 생략 가능
      const embed = new EmbedBuilder()
        .setTitle("📋 편제 현황")
        .setDescription(
          Object.keys(org)
            .map((dept) => {
              const list = (org[dept] || [])
                .map((m) => `<@${m.id}> / ${m.nickname}`)
                .join("\n");
              return `**${dept}**\n${list || "없음"}`;
            })
            .join("\n\n")
        );

      return interaction.reply({ embeds: [embed] });
    }
  } catch (e) {
    console.error("❌ interactionCreate error:", e);
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp({ content: "❌ 처리 중 오류가 발생했습니다.", ephemeral: true });
    }
    return interaction.reply({ content: "❌ 처리 중 오류가 발생했습니다.", ephemeral: true });
  }
});

// =========================
// Railway 안정성(크래시 로깅)
// =========================
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
});

// =========================
// Login
// =========================
client.login(TOKEN);