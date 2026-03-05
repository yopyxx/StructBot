// index.js (Discord.js v14 + Railway keepalive) - NO express

const fs = require("fs");
const path = require("path");
const http = require("http");

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

// =========================
// Railway Keep-Alive (HTTP) - NO express
// =========================
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    if (req.url === "/" || req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }
    res.writeHead(404);
    res.end("Not Found");
  })
  .listen(PORT, () => console.log(`[HTTP] Listening on :${PORT}`));

// =========================
// Discord Client
// =========================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// =========================
// ENV
// =========================
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error("❌ TOKEN 환경변수가 없습니다. Railway Variables에 TOKEN을 설정하세요.");
  process.exit(1);
}

const OWNER_ID = "942558158436589640";

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

const DATA_FILE = path.join(__dirname, "organization.json");

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { "재정교육단": [], "인사교육단_중령": [], "인사교육단_소령": [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch (e) {
    console.error("❌ organization.json 파싱 실패:", e);
    try { fs.copyFileSync(DATA_FILE, DATA_FILE + ".broken_backup"); } catch {}
    return { "재정교육단": [], "인사교육단_중령": [], "인사교육단_소령": [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

let org = loadData();

function isOwner(interaction) {
  return interaction.user?.id === OWNER_ID;
}

function hasCommandPermission(interaction) {
  if (isOwner(interaction)) return true;
  const member = interaction.member;
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  return false;
}

async function applyRoleUpdate(guildMember, update) {
  if (!guildMember || !update) return;

  const toAdd = (update.add || []).filter(Boolean);
  const toRemove = (update.remove || []).filter(Boolean);

  const currentRoleIds = new Set(guildMember.roles.cache.map((r) => r.id));
  const addList = toAdd.filter((id) => !currentRoleIds.has(id));
  const removeList = toRemove.filter((id) => currentRoleIds.has(id));

  if (addList.length > 0) await guildMember.roles.add(addList);
  if (removeList.length > 0) await guildMember.roles.remove(removeList);
}

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
    await client.application.commands.set(commands);
    console.log("✅ 슬래시 커맨드 등록 완료");
  } catch (e) {
    console.error("❌ 슬래시 커맨드 등록 실패:", e);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
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

      const targetMember = await guild.members.fetch(user.id);

      for (const k of Object.keys(org)) {
        org[k] = (org[k] || []).filter((m) => m.id !== user.id);
      }

      org[dept] = org[dept] || [];
      org[dept].push({ id: user.id, nickname });
      saveData(org);

      if (dept === "인사교육단_소령") {
        await applyRoleUpdate(targetMember, ROLE_UPDATES.major);
      }
      if (dept === "재정교육단") {
        await applyRoleUpdate(targetMember, ROLE_UPDATES.colonel);
      }

      return interaction.reply({
        content: `✅ ${targetMember} 편제 등록 완료 (${dept})`,
        ephemeral: true,
      });
    }

    if (interaction.commandName === "편제현황") {
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

process.on("unhandledRejection", (reason) => console.error("unhandledRejection:", reason));
process.on("uncaughtException", (err) => console.error("uncaughtException:", err));

client.login(TOKEN);
