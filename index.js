// @ts-nocheck
/**
 * Discord.js v14 - 편제(조직표) 관리 봇 (Node.js)
 * 반영사항:
 * 1) 권한 레벨 역할 ID 설정
 * 2) 특정 사용자(SUPER_USER_ID)에게 모든 명령어 권한 부여
 * 3) /편제추가 시 부서에 따라 대상자 역할 자동 제거/추가
 * 4) organization.json에 편제 + 공지메시지ID/채널ID 영구 저장
 * 5) ✅ /편제현황: Level 1 이상만 사용 가능 (userLevel==0 차단)
 *
 * 필요:
 * - npm i discord.js
 * - TOKEN, CLIENT_ID, GUILD_ID 환경변수 설정
 * - Developer Portal > Bot > Privileged Gateway Intents:
 *   ✅ Server Members Intent ON
 * - 봇 서버 권한:
 *   ✅ Manage Roles (역할관리)
 * - 역할 계층:
 *   봇 역할이 변경 대상 역할들보다 위에 있어야 함
 */

const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
} = require("discord.js");

// =========================
// 기본 설정
// =========================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // Discord Application ID
const GUILD_ID = process.env.GUILD_ID;   // 서버 ID

// ✅ 특정 사용자 풀권한(모든 명령어 가능)
const SUPER_USER_ID = "942558158436589640";

// 파일 경로
const DATA_FILE = path.join(__dirname, "organization.json");

// =========================
// 권한 레벨 설정
// =========================
const LEVEL_ROLES = {
  1: ["1440692062465953884"], // Level 1
  2: ["1432003250810388610"], // Level 2
  3: ["1432002835264045147"], // Level 3
};

function getUserLevel(member) {
  if (!member) return 0;

  // ✅ 특정 유저는 무조건 최고 권한
  if (String(member.id) === SUPER_USER_ID) return 999;

  if (!member?.roles?.cache) return 0;

  const userRoles = member.roles.cache.map((r) => r.id);
  const levels = Object.keys(LEVEL_ROLES).map(Number).sort((a, b) => b - a);

  for (const level of levels) {
    const roles = LEVEL_ROLES[level] || [];
    if (roles.some((rid) => userRoles.includes(String(rid)))) return level;
  }
  return 0;
}

// =========================
// 사령본부 직책/이모지
// =========================
const HQ_POSITIONS = [
  "교육사령관",
  "교육부사령관",
  "교육훈련부장",
  "종합행정학교장",
  "참모장",
  "인사행정단장",
  "기획관리단장",
  "법무관리단장",
  "주임원사",
];

const HQ_EMOJIS = {
  "교육사령관": "<:general:1478002425830047754>",
  "교육부사령관": "<:majorgeneral:1478002513692065939>",
  "교육훈련부장": "<:majorgeneral:1478002513692065939>",
  "종합행정학교장": "<:majorgeneral:1478002513692065939>",
  "참모장": "<:brigadier:1478002619577405500>",
  "인사행정단장": "<:brigadier:1478002619577405500>",
  "기획관리단장": "<:brigadier:1478002619577405500>",
  "법무관리단장": "<:brigadier:1478002619577405500>",
  "주임원사": "<:sergeantmajor:1478002719645106248>",
};

const DEPT_EMOJIS = {
  "재정교육단": "<:Colonel:1478005729146179645>",
  "인사교육단_중령": "<:Lieutenant_Colonel:1478005839427141744>",
  "인사교육단_소령": "<:Major:1478005902702284971>",
};

const DEPT_DISPLAY_NAME = {
  "재정교육단": "재정교육단",
  "인사교육단_중령": "인사교육단",
  "인사교육단_소령": "인사교육단",
};

const DEPT_RANK = {
  "재정교육단": "대령",
  "인사교육단_중령": "중령",
  "인사교육단_소령": "소령",
};

const LIMITS = {
  "재정교육단": 13,
  "인사교육단_중령": 28,
  "인사교육단_소령": 50,
};

// =========================
// 데이터 관리
// =========================
function defaultData() {
  return {
    편제: {
      "사령본부": [],
      "재정교육단": [],
      "인사교육단_중령": [],
      "인사교육단_소령": [],
    },
    공지: {
      messageId: null,
      channelId: null,
    },
  };
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return defaultData();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);

    const base = defaultData();
    if (!parsed.편제) parsed.편제 = base.편제;
    if (!parsed.공지) parsed.공지 = base.공지;

    for (const k of Object.keys(base.편제)) {
      if (!Array.isArray(parsed.편제[k])) parsed.편제[k] = [];
    }
    if (!("messageId" in parsed.공지)) parsed.공지.messageId = null;
    if (!("channelId" in parsed.공지)) parsed.공지.channelId = null;

    return parsed;
  } catch (e) {
    console.error("❌ organization.json 파싱 실패:", e);
    return defaultData();
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4), "utf-8");
}

let store = loadData(); // {편제, 공지}

// =========================
// 임베드 생성 유틸
// =========================
function buildEmbeds(guild, highlightUserId = null) {
  const 편제 = store.편제;

  // ===== 사령본부 =====
  const hqEmbed = new EmbedBuilder()
    .setTitle("📋 사령본부 편제 현황")
    .setColor(0x1f3a93);

  const hqLines = [];
  for (const pos of HQ_POSITIONS) {
    const emoji = HQ_EMOJIS[pos] || "";
    const slot = (편제["사령본부"] || []).find((m) => m.position === pos);

    if (slot) {
      const mem = guild.members.cache.get(String(slot.id));
      if (mem) {
        const starred = highlightUserId && String(mem.id) === String(highlightUserId);
        hqLines.push(
          starred
            ? `${emoji} | ${pos} : **${mem} / ${slot.nickname} ⭐**`
            : `${emoji} | ${pos} : ${mem} / ${slot.nickname}`
        );
      } else {
        hqLines.push(`${emoji} | ${pos} : 공석`);
      }
    } else {
      hqLines.push(`${emoji} | ${pos} : 공석`);
    }
  }

  hqEmbed.addFields([{ name: "사령본부", value: hqLines.join("\n"), inline: false }]);

  // ===== 교육단 =====
  const otherEmbed = new EmbedBuilder()
    .setTitle("📋 재정·인사교육단 편제 현황")
    .setColor(0x2ecc71);

  const deptOrder = ["재정교육단", "인사교육단_중령", "인사교육단_소령"];

  for (const dept of deptOrder) {
    const emoji = DEPT_EMOJIS[dept] || "";
    const list = [];

    for (const m of (편제[dept] || [])) {
      const mem = guild.members.cache.get(String(m.id));
      if (!mem) continue;

      const starred = highlightUserId && String(mem.id) === String(highlightUserId);
      list.push(starred ? `**${mem} / ${m.nickname} ⭐**` : `${mem} / ${m.nickname}`);
    }

    const current = list.length;
    const maximum = LIMITS[dept];
    const displayName = DEPT_DISPLAY_NAME[dept];
    const rankName = DEPT_RANK[dept];

    const fieldName = `${emoji} | ${displayName} (${rankName} : ${current}/${maximum})`;
    const fieldValue = list.length ? list.join("\n") : "없음";

    otherEmbed.addFields([{ name: fieldName, value: fieldValue, inline: false }]);
  }

  return [hqEmbed, otherEmbed];
}

// =========================
// 슬래시 명령어 등록
// =========================
const commands = [
  new SlashCommandBuilder()
    .setName("편제추가")
    .setDescription("재정교육단 또는 인사교육단에 인원을 추가합니다.")
    .addStringOption((opt) =>
      opt
        .setName("부서")
        .setDescription("추가할 부서를 선택하세요.")
        .setRequired(true)
        .addChoices(
          { name: "재정교육단", value: "재정교육단" },
          { name: "인사교육단 (중령)", value: "인사교육단_중령" },
          { name: "인사교육단 (소령)", value: "인사교육단_소령" }
        )
    )
    .addUserOption((opt) => opt.setName("대상").setDescription("추가할 멤버").setRequired(true))
    .addStringOption((opt) => opt.setName("닉네임").setDescription("표기할 닉네임").setRequired(true)),

  new SlashCommandBuilder()
    .setName("사령본부추가")
    .setDescription("사령본부 직책에 인원을 배치합니다.")
    .addStringOption((opt) => {
      opt.setName("직책").setDescription("직책 선택").setRequired(true);
      for (const p of HQ_POSITIONS) opt.addChoices({ name: p, value: p });
      return opt;
    })
    .addUserOption((opt) => opt.setName("대상").setDescription("배치할 멤버").setRequired(true))
    .addStringOption((opt) => opt.setName("닉네임").setDescription("표기할 닉네임").setRequired(true)),

  new SlashCommandBuilder()
    .setName("편제삭제")
    .setDescription("등록된 인원을 모든 편제에서 제거합니다.")
    .addUserOption((opt) => opt.setName("대상").setDescription("삭제할 멤버").setRequired(true)),

  new SlashCommandBuilder()
    .setName("편제현황")
    .setDescription("현재 사령본부 및 교육단 편제 현황을 확인합니다."),

  new SlashCommandBuilder()
    .setName("찾기")
    .setDescription("멘션한 인원이 어느 편제에 있는지 확인합니다.")
    .addUserOption((opt) => opt.setName("대상").setDescription("찾을 멤버").setRequired(true)),

  new SlashCommandBuilder()
    .setName("공지")
    .setDescription("현재 편제현황을 지정 채널에 공지로 등록합니다.")
    .addChannelOption((opt) => opt.setName("채널").setDescription("공지 올릴 채널").setRequired(true)),

  new SlashCommandBuilder()
    .setName("공지수정")
    .setDescription("등록된 편제 공지를 최신 정보로 수정합니다."),
].map((c) => c.toJSON());

async function registerCommands() {
  if (!TOKEN) throw new Error("TOKEN 환경변수가 없습니다.");
  if (!CLIENT_ID) throw new Error("CLIENT_ID 환경변수가 없습니다.");
  if (!GUILD_ID) throw new Error("GUILD_ID 환경변수가 없습니다.");

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log("✅ 슬래시 명령어 등록 완료");
}

// =========================
// 클라이언트 생성
// =========================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once("ready", async () => {
  console.log(`✅ 로그인 완료: ${client.user.tag}`);

  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    try {
      await guild.members.fetch();
      console.log("✅ 길드 멤버 캐시 로드 완료");
    } catch (e) {
      console.warn("⚠️ 멤버 fetch 실패(권한/규모/레이트리밋):", e?.message || e);
    }
  }
});

// =========================
// 인터랙션 처리
// =========================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: "길드에서만 사용 가능합니다.", ephemeral: true });
  }

  const me = await guild.members.fetch(interaction.user.id).catch(() => null);
  const userLevel = getUserLevel(me);

  try {
    // -------------------------
    // /편제추가
    // -------------------------
    if (interaction.commandName === "편제추가") {
      const dept = interaction.options.getString("부서", true);
      const targetUser = interaction.options.getUser("대상", true);
      const nickname = interaction.options.getString("닉네임", true);

      if (userLevel === 0) {
        return interaction.reply({ content: "❌ 권한이 없습니다.", ephemeral: true });
      }

      // 레벨1(대령)은 소령만 가능 (단, SUPER_USER는 예외)
      if (userLevel === 1 && userLevel !== 999 && dept !== "인사교육단_소령") {
        return interaction.reply({
          content: "❌ 소령 편제는 대령 이상만 추가 가능합니다.",
          ephemeral: true,
        });
      }

      if (!LIMITS[dept]) {
        return interaction.reply({ content: "❌ 잘못된 부서입니다.", ephemeral: true });
      }

      if ((store.편제[dept] || []).length >= LIMITS[dept]) {
        return interaction.reply({ content: "❌ 최대 인원 초과", ephemeral: true });
      }

      const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) {
        return interaction.reply({ content: "❌ 대상 멤버를 찾을 수 없습니다.", ephemeral: true });
      }

      // ===== 부서별 역할 자동 변경 =====
      if (dept === "인사교육단_소령") {
        const removeRoleId = "1432005822237380659";
        const addRoleIds = ["1432005794135802007", "1443933530135461908", "1434909470106058842"];
        try {
          if (targetMember.roles.cache.has(removeRoleId)) await targetMember.roles.remove(removeRoleId);
          const toAdd = addRoleIds.filter((rid) => !targetMember.roles.cache.has(rid));
          if (toAdd.length) await targetMember.roles.add(toAdd);
        } catch (e) {
          console.error("역할 변경 실패(소령):", e);
          return interaction.reply({
            content:
              "❌ 역할 변경에 실패했습니다. (봇 권한/역할 계층 확인 필요: Manage Roles + 봇 역할이 대상 역할보다 위)",
            ephemeral: true,
          });
        }
      }

      if (dept === "재정교육단") {
        const removeRoleId = "1018195906807480402";
        const addRoleId = "1018469270084132864";
        try {
          if (targetMember.roles.cache.has(removeRoleId)) await targetMember.roles.remove(removeRoleId);
          if (!targetMember.roles.cache.has(addRoleId)) await targetMember.roles.add(addRoleId);
        } catch (e) {
          console.error("역할 변경 실패(재정):", e);
          return interaction.reply({
            content:
              "❌ 역할 변경에 실패했습니다. (봇 권한/역할 계층 확인 필요: Manage Roles + 봇 역할이 대상 역할보다 위)",
            ephemeral: true,
          });
        }
      }

      // ===== 기존 중복 방지(교육단 1곳만 유지) =====
      for (const d of Object.keys(LIMITS)) {
        store.편제[d] = (store.편제[d] || []).filter((m) => String(m.id) !== String(targetUser.id));
      }

      store.편제[dept].push({ id: targetUser.id, nickname });
      saveData(store);

      return interaction.reply({ content: `${targetUser} 등록 완료`, ephemeral: true });
    }

    // -------------------------
    // /사령본부추가
    // -------------------------
    if (interaction.commandName === "사령본부추가") {
      const position = interaction.options.getString("직책", true);
      const targetUser = interaction.options.getUser("대상", true);
      const nickname = interaction.options.getString("닉네임", true);

      if (userLevel < 3 && userLevel !== 999) {
        return interaction.reply({
          content: "❌ 훈련부장 이상부터 사령본부 수정이 가능합니다.",
          ephemeral: true,
        });
      }

      store.편제["사령본부"] = (store.편제["사령본부"] || []).filter(
        (m) => m.position !== position && String(m.id) !== String(targetUser.id)
      );

      store.편제["사령본부"].push({ position, id: targetUser.id, nickname });
      saveData(store);

      return interaction.reply({ content: `${targetUser} → ${position} 등록 완료`, ephemeral: true });
    }

    // -------------------------
    // /편제삭제
    // -------------------------
    if (interaction.commandName === "편제삭제") {
      const targetUser = interaction.options.getUser("대상", true);

      if (userLevel < 2 && userLevel !== 999) {
        return interaction.reply({ content: "❌ 사령본부 이상만 사용 가능합니다.", ephemeral: true });
      }

      let removed = false;

      for (const dept of Object.keys(LIMITS)) {
        const before = (store.편제[dept] || []).length;
        store.편제[dept] = (store.편제[dept] || []).filter((m) => String(m.id) !== String(targetUser.id));
        if ((store.편제[dept] || []).length !== before) removed = true;
      }

      const beforeHQ = (store.편제["사령본부"] || []).length;
      store.편제["사령본부"] = (store.편제["사령본부"] || []).filter((m) => String(m.id) !== String(targetUser.id));
      if ((store.편제["사령본부"] || []).length !== beforeHQ) removed = true;

      saveData(store);

      if (removed) return interaction.reply({ content: `${targetUser} 편제에서 삭제 완료`, ephemeral: true });
      return interaction.reply({ content: "해당 인원은 등록되어 있지 않습니다.", ephemeral: true });
    }

    // -------------------------
    // ✅ /편제현황 (Level 1 이상만 허용)
    // -------------------------
    if (interaction.commandName === "편제현황") {
      if (userLevel === 0) {
        return interaction.reply({ content: "❌ 권한이 없습니다.", ephemeral: true });
      }

      await interaction.deferReply();
      const embeds = buildEmbeds(guild, null);
      return interaction.editReply({ embeds });
    }

    // -------------------------
    // /찾기
    // -------------------------
    if (interaction.commandName === "찾기") {
      const targetUser = interaction.options.getUser("대상", true);

      const inHQ = (store.편제["사령본부"] || []).some((m) => String(m.id) === String(targetUser.id));
      const inDept = Object.keys(LIMITS).some((dept) =>
        (store.편제[dept] || []).some((m) => String(m.id) === String(targetUser.id))
      );

      if (!inHQ && !inDept) {
        return interaction.reply({ content: "해당 인원은 편제에 없습니다.", ephemeral: true });
      }

      const embeds = buildEmbeds(guild, targetUser.id);
      return interaction.reply({ embeds });
    }

    // -------------------------
    // /공지
    // -------------------------
    if (interaction.commandName === "공지") {
      const channel = interaction.options.getChannel("채널", true);

      if (userLevel < 2 && userLevel !== 999) {
        return interaction.reply({ content: "❌ 사령본부 이상만 공지가 가능합니다.", ephemeral: true });
      }

      if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
        return interaction.reply({ content: "❌ 텍스트 채널만 선택 가능합니다.", ephemeral: true });
      }

      const embeds = buildEmbeds(guild, null);
      const msg = await channel.send({ embeds });

      store.공지.messageId = msg.id;
      store.공지.channelId = channel.id;
      saveData(store);

      return interaction.reply({ content: "✅ 편제 공지 생성 완료", ephemeral: true });
    }

    // -------------------------
    // /공지수정
    // -------------------------
    if (interaction.commandName === "공지수정") {
      if (userLevel < 3 && userLevel !== 999) {
        return interaction.reply({ content: "❌ 사령본부 이상만 공지수정이 가능합니다.", ephemeral: true });
      }

      const { messageId, channelId } = store.공지 || {};
      if (!messageId || !channelId) {
        return interaction.reply({ content: "❌ 등록된 공지가 없습니다.", ephemeral: true });
      }

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased?.()) {
        return interaction.reply({ content: "❌ 채널을 찾을 수 없습니다.", ephemeral: true });
      }

      const msg = await channel.messages.fetch(messageId).catch(() => null);
      if (!msg) {
        return interaction.reply({ content: "❌ 기존 공지를 찾을 수 없습니다.", ephemeral: true });
      }

      const embeds = buildEmbeds(guild, null);
      await msg.edit({ embeds });

      return interaction.reply({ content: "✅ 편제 공지 수정 완료", ephemeral: true });
    }
  } catch (err) {
    console.error("❌ 명령 처리 중 오류:", err);
    const safe = "❌ 처리 중 오류가 발생했습니다. 콘솔 로그를 확인해 주세요.";
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp({ content: safe, ephemeral: true }).catch(() => {});
    }
    return interaction.reply({ content: safe, ephemeral: true }).catch(() => {});
  }
});

// =========================
// 실행
// =========================
(async () => {
  try {
    await registerCommands();
    await client.login(TOKEN);
  } catch (e) {
    console.error("❌ 시작 실패:", e);
    process.exit(1);
  }
})();
