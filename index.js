// @ts-nocheck
/**
 * Discord.js v14 - 편제(조직표) 관리 봇 최종 완성본
 *
 * 기능
 * - /편제추가
 * - /사령본부추가
 * - /편제삭제
 * - /편제현황
 * - /찾기
 * - /공지
 * - /공지수정
 * - /해임
 *
 * 반영 사항
 * - 권한 레벨 시스템
 * - 특정 디스코드 ID(942558158436589640, 1369378060557877480) 모든 명령어 사용 가능
 * - /편제추가 시 부서별 역할 전체 교체
 * - /해임 시 역할 전체 교체 + 편제 자동 삭제
 * - /편제현황 Level 1 이상만 가능
 * - 슬래시 명령어 2개씩 뜨는 문제 방지
 * - LEVEL_ROLES 역할 ID를 문자열로 유지
 * - 편제현황을 새로 출력하면 이전 편제현황 출력 삭제
 * - 편제현황 임베드 3개 구조
 * - 재정교육단 표기: :brigadier: | 재정교육단 (준장 0/13)
 * - 소령 표기: :Major: | 소령 (0/80)
 *
 * 필수 환경변수
 * - TOKEN
 * - CLIENT_ID
 * - GUILD_ID
 *
 * 필수 권한
 * - Bot > Privileged Gateway Intents > Server Members Intent ON
 * - Manage Roles 권한
 * - 봇 역할이 부여/제거할 역할보다 위에 있어야 함
 */

const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");

// =========================
// 기본 설정
// =========================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const DATA_FILE = path.join(__dirname, "organization.json");

// =========================
// 봇 전체 관리자
// =========================
const SUPER_ADMIN_IDS = [
  "942558158436589640",
  "1369378060557877480",
];

// =========================
// 권한 레벨 설정
// 반드시 문자열로 유지
// =========================
const LEVEL_ROLES = {
  1: ["1440692062465953884"], // 대령
  2: ["1432003250810388610"], // 사령본부
  3: [
    "1432002835264045147",
    "1458110231287435417",
  ], // 사령관
};

function getUserLevel(member) {
  if (!member) return 0;

  if (SUPER_ADMIN_IDS.includes(String(member.id))) {
    return 999;
  }

  if (!member?.roles?.cache) return 0;

  const roleIds = new Set(member.roles.cache.map((r) => String(r.id)));
  const levels = Object.keys(LEVEL_ROLES)
    .map(Number)
    .sort((a, b) => b - a);

  for (const level of levels) {
    const targets = LEVEL_ROLES[level];
    if (targets.some((id) => roleIds.has(id))) {
      return level;
    }
  }

  return 0;
}

// =========================
// 해임 후 부여할 역할
// =========================
const DISMISS_ROLES = [
  "1432007526337089546",
  "1432006421523988664",
  "1432006106800197665",
  "1432005822237380659",
];

// =========================
// 부서별 자동 부여 역할
// ※ 인사교육단_대령은 별도 역할 ID가 없어서
// 현재 재정교육단과 동일한 세트로 넣어두었습니다.
// 실제 서버 구조에 맞는 역할 ID가 있다면 이 부분만 교체하세요.
// =========================
const DEPT_ASSIGN_ROLES = {
  "재정교육단": [
    "1432007526337089546",
    "1432006421523988664",
    "1432006106800197665",
    "1434909470106058842",
    "1443933530135461908",
    "1440692062465953884",
  ],

  "인사교육단_대령": [
    "1432007526337089546",
    "1432006421523988664",
    "1432006106800197665",
    "1434909470106058842",
    "1443933530135461908",
    "1440692062465953884",
  ],

  "인사교육단_중령": [
    "1432007526337089546",
    "1432006421523988664",
    "1432006106800197665",
    "1432005794135802007",
    "1473698641628631153",
    "1443933530135461908",
    "1434909470106058842",
  ],

  "인사교육단_소령": [
    "1432007526337089546",
    "1432006421523988664",
    "1432006106800197665",
    "1434909470106058842",
    "1443933530135461908",
    "1432005794135802007",
  ],
};

// =========================
// 사령본부 직책
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

// =========================
// 디스코드 커스텀 이모지
// =========================
const HQ_EMOJIS = {
  "교육사령관": "<:General:1478002425830047754>",
  "교육부사령관": "<:LieutenantGeneral:1478002513692065939>",
  "교육훈련부장": "<:LieutenantGeneral:1478002513692065939>",
  "종합행정학교장": "<:LieutenantGeneral:1478002513692065939>",
  "참모장": "<:majorgeneral:1478002619577405500>",
  "인사행정단장": "<:majorgeneral:1478002619577405500>",
  "기획관리단장": "<:majorgeneral:1478002619577405500>",
  "법무관리단장": "<:majorgeneral:1478002619577405500>",
  "주임원사": "<:sergeantmajor:1478002719645106248>",
};

const ORG_EMOJIS = {
  brigadier: "<:brigadier:1478002619577405500>",
  colonel: "<:Colonel:1478005729146179645>",
  ltcolonel: "<:Lieutenant_Colonel:1478005839427141744>",
  major: "<:Major:1478005902702284971>",
};

// =========================
// 정원
// =========================
const LIMITS = {
  "재정교육단": 13,
  "인사교육단_대령": 28,
  "인사교육단_중령": 50,
  "인사교육단_소령": 80,
};

// =========================
// 데이터 관리
// =========================
function defaultData() {
  return {
    편제: {
      "사령본부": [],
      "재정교육단": [],
      "인사교육단_대령": [],
      "인사교육단_중령": [],
      "인사교육단_소령": [],
    },
    공지: {
      messageId: null,
      channelId: null,
    },
    편제현황메시지: {
      messageId: null,
      channelId: null,
    },
  };
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return defaultData();
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const base = defaultData();

    if (!parsed.편제 || typeof parsed.편제 !== "object") parsed.편제 = base.편제;
    if (!parsed.공지 || typeof parsed.공지 !== "object") parsed.공지 = base.공지;
    if (!parsed.편제현황메시지 || typeof parsed.편제현황메시지 !== "object") {
      parsed.편제현황메시지 = base.편제현황메시지;
    }

    for (const key of Object.keys(base.편제)) {
      if (!Array.isArray(parsed.편제[key])) {
        parsed.편제[key] = [];
      }
    }

    if (!("messageId" in parsed.공지)) parsed.공지.messageId = null;
    if (!("channelId" in parsed.공지)) parsed.공지.channelId = null;

    if (!("messageId" in parsed.편제현황메시지)) parsed.편제현황메시지.messageId = null;
    if (!("channelId" in parsed.편제현황메시지)) parsed.편제현황메시지.channelId = null;

    return parsed;
  } catch (err) {
    console.error("organization.json 파싱 실패:", err);
    return defaultData();
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

let store = loadData();

// =========================
// 유틸
// =========================
function removeUserFromOrganization(targetId) {
  let removed = false;
  const strId = String(targetId);

  for (const dept of Object.keys(LIMITS)) {
    const before = store.편제[dept].length;
    store.편제[dept] = store.편제[dept].filter((m) => String(m.id) !== strId);
    if (store.편제[dept].length !== before) removed = true;
  }

  const beforeHQ = store.편제["사령본부"].length;
  store.편제["사령본부"] = store.편제["사령본부"].filter(
    (m) => String(m.id) !== strId
  );
  if (store.편제["사령본부"].length !== beforeHQ) removed = true;

  return removed;
}

async function replaceMemberRoles(member, roleIds, guild) {
  const removableRoles = member.roles.cache.filter((role) => role.id !== guild.id);

  if (removableRoles.size > 0) {
    await member.roles.remove(removableRoles);
  }

  if (roleIds && roleIds.length > 0) {
    await member.roles.add(roleIds);
  }
}

async function safeFetchMember(guild, userId) {
  return await guild.members.fetch(userId).catch(() => null);
}

async function deletePreviousOrgStatusMessage() {
  try {
    const { messageId, channelId } = store.편제현황메시지 || {};
    if (!messageId || !channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return;

    await message.delete().catch(() => null);
  } catch (err) {
    console.error("이전 편제현황 메시지 삭제 실패:", err);
  } finally {
    store.편제현황메시지 = {
      messageId: null,
      channelId: null,
    };
    saveData(store);
  }
}

function buildEmbeds(guild, highlightUserId = null) {
  // =========================
  // 임베드 1 - 사령본부 + 재정교육단
  // =========================
  const embed1 = new EmbedBuilder()
    .setColor(0x1f3a93)
    .setTitle("사령본부");

  const hqLines = [];
  for (const pos of HQ_POSITIONS) {
    const emoji = HQ_EMOJIS[pos] || "";
    const member = store.편제["사령본부"].find((m) => m.position === pos);

    if (member) {
      const memObj = guild.members.cache.get(String(member.id));
      if (memObj) {
        const isTarget =
          highlightUserId && String(memObj.id) === String(highlightUserId);

        hqLines.push(
          isTarget
            ? `${emoji} | ${pos} : **${memObj} / ${member.nickname} ⭐**`
            : `${emoji} | ${pos} : ${memObj} / ${member.nickname}`
        );
      } else {
        hqLines.push(`${emoji} | ${pos} :`);
      }
    } else {
      hqLines.push(`${emoji} | ${pos} :`);
    }
  }

  const financeMembers = [];
  for (const m of store.편제["재정교육단"]) {
    const memObj = guild.members.cache.get(String(m.id));
    if (!memObj) continue;

    const isTarget =
      highlightUserId && String(memObj.id) === String(highlightUserId);

    financeMembers.push(
      isTarget
        ? `**${memObj} / ${m.nickname} ⭐**`
        : `${memObj} / ${m.nickname}`
    );
  }

  const embed1Desc = [
    ...hqLines,
    "",
    `${ORG_EMOJIS.brigadier} | 재정교육단 (준장 ${store.편제["재정교육단"].length}/${LIMITS["재정교육단"]})`,
    ...(financeMembers.length > 0 ? financeMembers : []),
  ].join("\n");

  embed1.setDescription(embed1Desc);

  // =========================
  // 임베드 2 - 인사교육단(대령/중령)
  // =========================
  const colonelMembers = [];
  for (const m of store.편제["인사교육단_대령"]) {
    const memObj = guild.members.cache.get(String(m.id));
    if (!memObj) continue;

    const isTarget =
      highlightUserId && String(memObj.id) === String(highlightUserId);

    colonelMembers.push(
      isTarget
        ? `**${memObj} / ${m.nickname} ⭐**`
        : `${memObj} / ${m.nickname}`
    );
  }

  const ltcolonelMembers = [];
  for (const m of store.편제["인사교육단_중령"]) {
    const memObj = guild.members.cache.get(String(m.id));
    if (!memObj) continue;

    const isTarget =
      highlightUserId && String(memObj.id) === String(highlightUserId);

    ltcolonelMembers.push(
      isTarget
        ? `**${memObj} / ${m.nickname} ⭐**`
        : `${memObj} / ${m.nickname}`
    );
  }

  const embed2 = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setDescription(
      [
        `${ORG_EMOJIS.colonel} | 인사교육단 (대령 ${store.편제["인사교육단_대령"].length}/${LIMITS["인사교육단_대령"]})`,
        ...(colonelMembers.length > 0 ? colonelMembers : []),
        "",
        `${ORG_EMOJIS.ltcolonel} | 인사교육단 (중령 ${store.편제["인사교육단_중령"].length}/${LIMITS["인사교육단_중령"]})`,
        ...(ltcolonelMembers.length > 0 ? ltcolonelMembers : []),
      ].join("\n")
    );

  // =========================
  // 임베드 3 - 소령
  // =========================
  const majorMembers = [];
  for (const m of store.편제["인사교육단_소령"]) {
    const memObj = guild.members.cache.get(String(m.id));
    if (!memObj) continue;

    const isTarget =
      highlightUserId && String(memObj.id) === String(highlightUserId);

    majorMembers.push(
      isTarget
        ? `**${memObj} / ${m.nickname} ⭐**`
        : `${memObj} / ${m.nickname}`
    );
  }

  const embed3 = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(
      `${ORG_EMOJIS.major} | 소령 (${store.편제["인사교육단_소령"].length}/${LIMITS["인사교육단_소령"]})`
    );

  if (majorMembers.length > 0) {
    embed3.setDescription(majorMembers.join("\n"));
  }

  return [embed1, embed2, embed3];
}

async function refreshNoticeIfExists(guild) {
  try {
    const { messageId, channelId } = store.공지 || {};
    if (!messageId || !channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return;

    const embeds = buildEmbeds(guild, null);
    await message.edit({ embeds }).catch(() => null);
  } catch (err) {
    console.error("공지 자동 갱신 실패:", err);
  }
}

// =========================
// 슬래시 명령어 정의
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
          { name: "재정교육단", value: "재정교육단" },
          { name: "인사교육단 (대령)", value: "인사교육단_대령" },
          { name: "인사교육단 (중령)", value: "인사교육단_중령" },
          { name: "인사교육단 (소령)", value: "인사교육단_소령" }
        )
    )
    .addUserOption((opt) =>
      opt.setName("대상").setDescription("추가할 멤버").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("닉네임").setDescription("표기할 닉네임").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("사령본부추가")
    .setDescription("사령본부 직책에 인원을 배치합니다.")
    .addStringOption((opt) => {
      opt.setName("직책").setDescription("직책 선택").setRequired(true);
      for (const p of HQ_POSITIONS) {
        opt.addChoices({ name: p, value: p });
      }
      return opt;
    })
    .addUserOption((opt) =>
      opt.setName("대상").setDescription("배치할 멤버").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("닉네임").setDescription("표기할 닉네임").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("편제삭제")
    .setDescription("등록된 인원을 모든 편제에서 제거합니다.")
    .addUserOption((opt) =>
      opt.setName("대상").setDescription("삭제할 멤버").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("편제현황")
    .setDescription("현재 사령본부 및 교육단 편제 현황을 확인합니다."),

  new SlashCommandBuilder()
    .setName("찾기")
    .setDescription("멘션한 인원이 어느 편제에 있는지 확인합니다.")
    .addUserOption((opt) =>
      opt.setName("대상").setDescription("찾을 멤버").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("공지")
    .setDescription("현재 편제현황을 지정 채널에 공지로 등록합니다.")
    .addChannelOption((opt) =>
      opt.setName("채널").setDescription("공지할 채널").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("공지수정")
    .setDescription("등록된 편제 공지를 최신 정보로 수정합니다."),

  new SlashCommandBuilder()
    .setName("해임")
    .setDescription("해당 유저의 모든 역할을 제거하고 기본 역할을 부여합니다.")
    .addUserOption((opt) =>
      opt.setName("대상").setDescription("해임할 유저").setRequired(true)
    ),
].map((cmd) => cmd.toJSON());

// =========================
// 슬래시 명령어 등록
// =========================
async function registerCommands() {
  if (!TOKEN) throw new Error("TOKEN 환경변수가 없습니다.");
  if (!CLIENT_ID) throw new Error("CLIENT_ID 환경변수가 없습니다.");
  if (!GUILD_ID) throw new Error("GUILD_ID 환경변수가 없습니다.");

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
  console.log("✅ 글로벌 슬래시 명령어 정리 완료");

  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: commands,
  });
  console.log("✅ 길드 슬래시 명령어 등록 완료");
}

// =========================
// 클라이언트 생성
// =========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once("ready", async () => {
  console.log(`✅ 로그인 완료: ${client.user.tag}`);

  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    try {
      await guild.members.fetch();
      console.log("✅ 길드 멤버 캐시 로드 완료");
    } catch (err) {
      console.warn("⚠️ 길드 멤버 전체 fetch 실패:", err?.message || err);
    }
  }
});

// =========================
// 인터랙션 처리
// =========================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!interaction.guild) {
    return interaction.reply({
      content: "❌ 길드에서만 사용 가능합니다.",
      ephemeral: true,
    });
  }

  const guild = interaction.guild;
  const executorMember = await safeFetchMember(guild, interaction.user.id);
  const userLevel = getUserLevel(executorMember);

  try {
    // /편제추가
    if (interaction.commandName === "편제추가") {
      const dept = interaction.options.getString("부서", true);
      const targetUser = interaction.options.getUser("대상", true);
      const nickname = interaction.options.getString("닉네임", true);

      if (userLevel === 0) {
        return interaction.reply({
          content: "❌ 권한이 없습니다.",
          ephemeral: true,
        });
      }

      if (userLevel === 1 && dept !== "인사교육단_소령") {
        return interaction.reply({
          content: "❌ 대령 권한은 인사교육단(소령)만 추가 가능합니다.",
          ephemeral: true,
        });
      }

      if (!LIMITS[dept]) {
        return interaction.reply({
          content: "❌ 잘못된 부서입니다.",
          ephemeral: true,
        });
      }

      const targetMember = await safeFetchMember(guild, targetUser.id);
      if (!targetMember) {
        return interaction.reply({
          content: "❌ 대상 멤버를 찾을 수 없습니다.",
          ephemeral: true,
        });
      }

      const currentDeptMembers = store.편제[dept] || [];
      const isAlreadyInSameDept = currentDeptMembers.some(
        (m) => String(m.id) === String(targetUser.id)
      );

      if (!isAlreadyInSameDept && currentDeptMembers.length >= LIMITS[dept]) {
        return interaction.reply({
          content: "❌ 최대 인원 초과",
          ephemeral: true,
        });
      }

      for (const d of Object.keys(LIMITS)) {
        store.편제[d] = store.편제[d].filter(
          (m) => String(m.id) !== String(targetUser.id)
        );
      }

      store.편제[dept].push({
        id: targetUser.id,
        nickname,
      });

      const rolesToAssign = DEPT_ASSIGN_ROLES[dept] || [];

      await replaceMemberRoles(targetMember, rolesToAssign, guild);
      saveData(store);
      await refreshNoticeIfExists(guild);

      return interaction.reply({
        content: `✅ ${targetUser} 님을 ${dept} 편제에 등록했고, 역할을 새로 적용했습니다.`,
        ephemeral: true,
      });
    }

    // /사령본부추가
    if (interaction.commandName === "사령본부추가") {
      const position = interaction.options.getString("직책", true);
      const targetUser = interaction.options.getUser("대상", true);
      const nickname = interaction.options.getString("닉네임", true);

      if (userLevel < 3) {
        return interaction.reply({
          content: "❌ 훈련부장 이상부터 사령본부 수정이 가능합니다.",
          ephemeral: true,
        });
      }

      store.편제["사령본부"] = store.편제["사령본부"].filter(
        (m) => m.position !== position && String(m.id) !== String(targetUser.id)
      );

      store.편제["사령본부"].push({
        position,
        id: targetUser.id,
        nickname,
      });

      saveData(store);
      await refreshNoticeIfExists(guild);

      return interaction.reply({
        content: `${targetUser} → ${position} 등록 완료`,
        ephemeral: true,
      });
    }

    // /편제삭제
    if (interaction.commandName === "편제삭제") {
      const targetUser = interaction.options.getUser("대상", true);

      if (userLevel < 2) {
        return interaction.reply({
          content: "❌ 사령본부 이상만 사용 가능합니다.",
          ephemeral: true,
        });
      }

      const removed = removeUserFromOrganization(targetUser.id);
      saveData(store);
      await refreshNoticeIfExists(guild);

      if (removed) {
        return interaction.reply({
          content: `${targetUser} 편제에서 삭제 완료`,
          ephemeral: true,
        });
      }

      return interaction.reply({
        content: "해당 인원은 등록되어 있지 않습니다.",
        ephemeral: true,
      });
    }

    // /편제현황
    if (interaction.commandName === "편제현황") {
      if (userLevel < 1) {
        return interaction.reply({
          content: "❌ 대령 이상만 사용 가능합니다.",
          ephemeral: true,
        });
      }

      await deletePreviousOrgStatusMessage();

      const embeds = buildEmbeds(guild, null);

      const sentMessage = await interaction.reply({
        embeds,
        fetchReply: true,
      });

      store.편제현황메시지 = {
        messageId: sentMessage.id,
        channelId: sentMessage.channel.id,
      };
      saveData(store);

      return;
    }

    // /찾기
    if (interaction.commandName === "찾기") {
      const targetUser = interaction.options.getUser("대상", true);

      const inHQ = store.편제["사령본부"].some(
        (m) => String(m.id) === String(targetUser.id)
      );
      const inDept = Object.keys(LIMITS).some((dept) =>
        store.편제[dept].some((m) => String(m.id) === String(targetUser.id))
      );

      if (!inHQ && !inDept) {
        return interaction.reply({
          content: "해당 인원은 편제에 없습니다.",
          ephemeral: true,
        });
      }

      const embeds = buildEmbeds(guild, targetUser.id);
      return interaction.reply({ embeds });
    }

    // /공지
    if (interaction.commandName === "공지") {
      const channel = interaction.options.getChannel("채널", true);

      if (userLevel < 2) {
        return interaction.reply({
          content: "❌ 사령본부 이상만 공지가 가능합니다.",
          ephemeral: true,
        });
      }

      const allowedChannelTypes = [
        ChannelType.GuildText,
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
        ChannelType.AnnouncementThread,
      ];

      if (!channel.isTextBased() || !allowedChannelTypes.includes(channel.type)) {
        return interaction.reply({
          content: "❌ 텍스트 채널만 선택 가능합니다.",
          ephemeral: true,
        });
      }

      const embeds = buildEmbeds(guild, null);
      const msg = await channel.send({ embeds });

      store.공지.messageId = msg.id;
      store.공지.channelId = channel.id;
      saveData(store);

      return interaction.reply({
        content: "✅ 편제 공지 생성 완료",
        ephemeral: true,
      });
    }

    // /공지수정
    if (interaction.commandName === "공지수정") {
      if (userLevel < 3) {
        return interaction.reply({
          content: "❌ Level 3 이상만 공지수정이 가능합니다.",
          ephemeral: true,
        });
      }

      const { messageId, channelId } = store.공지;

      if (!messageId || !channelId) {
        return interaction.reply({
          content: "❌ 등록된 공지가 없습니다.",
          ephemeral: true,
        });
      }

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        return interaction.reply({
          content: "❌ 채널을 찾을 수 없습니다.",
          ephemeral: true,
        });
      }

      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) {
        return interaction.reply({
          content: "❌ 기존 공지를 찾을 수 없습니다.",
          ephemeral: true,
        });
      }

      const embeds = buildEmbeds(guild, null);
      await message.edit({ embeds });

      return interaction.reply({
        content: "✅ 편제 공지 수정 완료",
        ephemeral: true,
      });
    }

    // /해임
    if (interaction.commandName === "해임") {
      const targetUser = interaction.options.getUser("대상", true);
      const targetMember = await safeFetchMember(guild, targetUser.id);

      if (!targetMember) {
        return interaction.reply({
          content: "❌ 유저를 찾을 수 없습니다.",
          ephemeral: true,
        });
      }

      if (userLevel < 2) {
        return interaction.reply({
          content: "❌ 사령본부 이상만 사용 가능합니다.",
          ephemeral: true,
        });
      }

      const removedFromOrg = removeUserFromOrganization(targetMember.id);
      await replaceMemberRoles(targetMember, DISMISS_ROLES, guild);
      saveData(store);
      await refreshNoticeIfExists(guild);

      return interaction.reply({
        content: removedFromOrg
          ? `⚠️ ${targetMember} 해임 처리 완료 (편제 자동 삭제 포함)`
          : `⚠️ ${targetMember} 해임 처리 완료`,
        ephemeral: false,
      });
    }
  } catch (err) {
    console.error("명령 처리 중 오류:", err);

    const errorMessage =
      "❌ 처리 중 오류가 발생했습니다. 봇 역할 위치, Manage Roles 권한, 환경변수를 확인해주세요.";

    if (interaction.deferred || interaction.replied) {
      return interaction.followUp({
        content: errorMessage,
        ephemeral: true,
      }).catch(() => {});
    }

    return interaction.reply({
      content: errorMessage,
      ephemeral: true,
    }).catch(() => {});
  }
});

// =========================
// 실행
// =========================
(async () => {
  try {
    await registerCommands();
    await client.login(TOKEN);
  } catch (err) {
    console.error("❌ 시작 실패:", err);
    process.exit(1);
  }
})();
