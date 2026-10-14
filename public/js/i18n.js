// TeleGuard Unified Internationalization (i18n) Engine
(function () {
  const STORAGE_KEY = "teleguard_lang";

  // Language dictionaries: Default is English ('en')
  const resources = {
    en: {
      // General & Common
      app_title: "TeleGuard Administration Panel",
      dashboard_title: "TeleGuard Admin Panel",
      logout: "Logout",
      save: "Save",
      cancel: "Cancel",
      close: "Close",
      confirm: "Confirm",
      reset: "Reset",
      search: "Search",
      copy: "Copy",
      action: "Action",
      actions: "Actions",
      duration_mins: "Duration (mins)",
      status: "Status",
      enabled: "Enabled",
      disabled: "Disabled",
      back: "Back",
      loading: "Loading...",
      or: "or",
      
      // Top Navigation Tabs
      mod_community: "Community Management",
      mod_draw: "Lucky Draw",

      // Sidebar Navigation
      nav_rules: "Rules & Styling",
      nav_users: "User Management",
      nav_history: "Leaderboard",
      nav_commands: "Command Settings",
      nav_spam: "Safety & Spam",
      nav_captcha: "Group Captcha",
      nav_actions: "Recent Actions",

      // Login Card
      login_title: "Admin Login",
      login_subtitle: "Please log in using one of the methods below",
      login_pass_placeholder: "Admin Password",
      login_pass_btn: "Login with Password",
      login_error: "Incorrect password, please try again!",
      login_tg_btn: "Login via Telegram",
      login_tg_step1: "Please open @Bot on Telegram and send the verification code below to login:",
      login_tg_step2: "Or click the button below to verify directly:",
      login_tg_verify_btn: "Verify on Telegram",

      // Safety & Spam Interceptors
      spam_link_interceptor: "Enable Link Whitelist Interceptor",
      spam_whitelist_domains: "Whitelisted Domains (One per line, wildcards like *.x.com supported):",
      spam_ignored_topics: "Ignored Spam Topic IDs (Comma or newline separated; messages in these topics bypass filters):",
      
      rule_rtlo_title: "1. Block RTLO Characters (\\u202e)",
      rule_rtlo_desc: "Detect Right-to-Left Override characters often used to spoof deceptive URLs.",
      rule_action_label: "Action",
      rule_duration_label: "Duration (mins)",
      action_ban: "Ban",
      action_mute: "Mute",
      action_delete_only: "Delete Only",

      rule_new_user_title: "2. Restrict Links from New Members",
      rule_new_user_desc: "Restrict new group members (Level 1 & XP < 50) from sending external links.",

      rule_cas_title: "3. Combot CAS Global Blacklist",
      rule_cas_desc: "Query Combot CAS global database on first user message to block known spammers.",

      rule_inline_keyboard_title: "4. Block Inline Keyboards (Non-Admins)",
      rule_inline_keyboard_desc: "Block messages with custom inline button keyboards sent by non-administrators.",

      rule_inline_bot_title: "5. Block Messages via Inline Bots",
      rule_inline_bot_desc: "Block messages sent via inline bots (e.g. @some_bot). Whitelisted bots allowed below.",
      rule_inline_bot_whitelist: "Whitelisted Inline Bots (Comma separated, e.g. gif, vote, like, poll):",
      rule_inline_bot_tip: "💡 Note: Bots listed here (without @, e.g. gif, poll) are exempted from inline bot blocking.",

      rule_keywords_title: "6. Auto-Filter Spam Keywords",
      rule_keywords_desc: "Matches keywords against messages, usernames, and nicknames with Unicode variation unfolding.",
      rule_keywords_label: "Spam Keywords Configuration (Comma separated):",
      rule_keywords_placeholder: "e.g. easy money, claim airdrop, connect wallet, earn fast",

      rule_flood_title: "7. Message Flood Control",
      rule_flood_desc: "Throttle rapid consecutive messages from a single user within a short time window.",
      rule_flood_max_msgs: "Max Messages",
      rule_flood_window: "Time Window (sec)",

      rule_emoji_title: "8. Emoji Density Limit",
      rule_emoji_desc: "Limit maximum number of emoji characters allowed in a single message.",
      rule_emoji_max: "Max Emojis",

      // Welcome & Captcha
      welcome_title: "🎉 Member Welcome Message",
      welcome_text_label: "Welcome Message Text",
      captcha_scope_title: "🎯 Captcha & Welcome Interaction Scope",
      captcha_math_label: "Math Challenge ({mention}, {timeout}, {group})",
      captcha_6char_label: "6-Character Code ({mention}, {timeout}, {group})",
      captcha_click_label: "1-Click Button ({mention}, {timeout}, {group})",
      captcha_btn_text: "Button Label for 1-Click Verification",
      captcha_non_owner_alert: "Non-Owner Click Alert",
      captcha_fail1_alert: "Attempt 1 Incorrect Alert",
      captcha_fail2_alert: "Attempt 2 Final Fail Kick Alert",

      // Lucky Draw UI & Modals
      draw_engine_label: "Engine:",
      draw_engine_running: "Running",
      draw_engine_sleeping: "Sleeping",
      draw_sleeping_curtain_tip: "Lucky Draw Engine is Sleeping · Toggle switch in top right to unlock panel",
      draw_bot_token_title: "Telegram Bot Token Configuration",
      draw_bot_token_desc: "Bot Token is stored only in runtime memory and never persisted to disk. Re-entry required after server restart.",
      draw_bjt_warning: "⚠️ Enter time in Beijing Time (UTC+8). Cannot be in the past.",
      draw_confirm_modal_title: "🎲 Draw Confirmation",
      draw_confirm_modal_sub: "Select draw mode: Full Random or Pre-designated Winners",
      draw_confirm_camp_name: "Campaign Title:",
      draw_confirm_target_comm: "Target Community:",
      draw_confirm_prizes: "Prizes:",
      draw_confirm_participants: "Participants:",
      draw_confirm_mode_time: "Draw Mode / Time:",
      draw_confirm_designated: "Designated Winners:",
      draw_confirm_draw_now_q: "Draw Now?",
      draw_confirm_draw_now_desc: "Draw immediately at full random, or enter designated mode to pick specific winners.",
      draw_btn_random_now: "Draw Now (Full Random)",
      draw_btn_random_now_sub: "All prizes randomly drawn and announced instantly.",
      draw_btn_designated: "Designated Draw (Pre-assign Winners)",
      draw_btn_designated_sub: "Pre-assign winners to specific prizes, then draw now or schedule.",
      draw_btn_cancel_back: "Cancel (Back)",
      draw_quota_total: "Total Prizes:",
      draw_quota_assigned: "Assigned:",
      draw_quota_remaining: "Remaining Random:",
      draw_quota_tip: "💡 Add designated participants and assigned prizes below. Remaining prizes will be randomly drawn.",
      draw_btn_add_designated: "➕ Add Designated Winner",
      draw_btn_clear_designated: "Clear All (Reset to Random)",
      draw_limit_reached: "Prize quota limit reached",
      draw_auto_time_label: "⏰ Auto Draw Time (UTC+8):",
      draw_auto_time_sub: "If unset, configure time here and draw on schedule.",
      draw_btn_draw_scheduled: "⏰ Draw on Auto Draw Schedule",
      draw_btn_draw_now_instant: "⚡ Draw Now",
      draw_picker_title: "Select Designated Winner",
      draw_picker_search_placeholder: "Search Telegram @username or nickname...",
      draw_picker_total_prefix: "participants total",
      draw_picker_match_prefix: "matching",
      draw_picker_case_note: "Case-insensitive username and nickname match",
      draw_copy_template: "📋 Copy",
      draw_copy_template_title: "Copy as Template",
      draw_designated_badge: "🎯 Designated",
      draw_registered_suffix: "registered",
      draw_auto_draw_suffix: "(Auto Draw)",
      draw_ended_suffix: "(Campaign Ended)",
      draw_manual_draw: "Manual Draw",

      // Help Modal & Documentation
      doc_action_defs: "🛡️ Action Type Definitions",
      doc_ban_desc: "Kicks the spammer from the group and permanently bans them.",
      doc_mute_desc: "Restricts the user from sending messages, media, or links temporarily or permanently.",
      doc_delete_desc: "Removes the offending message immediately without restricting the user.",
      doc_safety_rules: "⚙️ Safety Interception Rules",
      doc_rtlo_rule: "1. RTLO Characters Detection",
      doc_new_user_rule: "2. New Member Link Restriction",
      doc_cas_rule: "3. Combot CAS Global Blacklist",
      doc_inline_kb_rule: "4. Block Inline Keyboards",
      doc_inline_bot_rule: "5. Block Messages via Inline Bots",
      doc_keywords_rule: "6. Auto-Ban Spam Keywords",
      doc_flood_rule: "7. Message Flood Control",

      // Toast & Alert JS Messages
      toast_engine_woken: "⚡ Lucky draw engine active! Auto draw scheduler started.",
      toast_engine_slept: "💤 Lucky draw engine sleeping: 0 memory overhead.",
      toast_toggle_failed: "Failed to toggle draw engine: ",
      toast_engine_auto_woken: "⚡ Lucky draw engine has been automatically activated!",
      toast_draw_success: "🎉 Draw completed! Winners announced to community.",
      alert_set_autodraw_time: "⚠️ Please set an auto draw time (UTC+8)!",
      alert_invalid_time_format: "⚠️ Invalid auto draw time format, please reselect!",
      alert_time_cannot_be_past: "⚠️ Auto draw time cannot be in the past! Please select a future time.",
      alert_wake_failed: "Failed to wake up draw engine: ",
      alert_draw_failed: "Draw failed: ",
      alert_no_participants: "No participants yet for this draw, cannot designate winners!",
      confirm_wake_and_publish: "⚠️ Lucky draw engine is currently sleeping.\n\nWake up engine now and publish campaign?",
      confirm_wake_and_draw: "⚠️ Lucky draw engine is currently sleeping.\n\nWake up engine now to proceed with draw?",

      // Additional dynamic draw strings
      draw_no_match_participant: "No participants found matching",
      draw_already_assigned: "Assigned in another row",
      draw_currently_selected: "Selected",
      draw_btn_select: "Select",
      draw_alert_limit_reached: "Prize quota limit reached, cannot add more.",
      draw_alert_all_assigned: "All participants have been designated, cannot add more.",
      draw_click_select_winner: "Click to select or search winner",
      draw_btn_open_search: "Search",
      draw_btn_remove: "Remove",
      draw_status_over: "Over",
      draw_status_full: "Full",
      draw_status_remaining: "Left",
      draw_all_participants_done: "All participants have been designated",
      draw_alert_duplicate_user: "⚠️ Duplicate winner assigned! A user can only win once per draw.",
      draw_alert_prize_quota_exceeded: "⚠️ Prize quota exceeded for this prize!",
      draw_alert_need_autodraw_time: "⚠️ Auto draw time must be configured for scheduled draws! Please select above.",
      draw_btn_saving: "Saving...",
      draw_toast_save_success: "✅ Successfully saved designated winners! Will auto draw on schedule.",
      draw_toast_random_saved: "✅ Saved random draw configuration! Will auto draw on schedule.",
      draw_alert_save_failed: "Save failed: ",
      draw_btn_drawing: "Drawing...",
      draw_drawing_broadcasting: "⏳ Drawing randomly and broadcasting...",
      draw_server_conn_failed: "Failed to connect to backend service (Failed to fetch). Please check that the server is running.",

      draw_current_bjt: "Current BJT",
      draw_prizes_unit: "total",
      draw_no_scheduled_time: "No scheduled time set",
      draw_set_time_and_schedule: "⏰ Set Time and Schedule Draw",
      draw_search_user_or_nickname: "Search username or nickname...",
      draw_expand_search_modal: "Expand Search Modal",
      draw_btn_expand: "Expand",
      // Leaderboard
      lb_activity_ranking: "Activity Ranking",
      lb_weekly: "Weekly",
      lb_all_time: "All-Time",
      lb_loading: "Loading Leaderboard...",
      lb_you: "YOU",
      lb_footer_loading: "Loading...",
      lb_empty: "No activity records yet for this period.",
      lb_error: "Failed to load leaderboard data.",

      // Language Switch Label
      lang_switch_btn: "English"
    },
    zh: {
      // 通用
      app_title: "TeleGuard 管理后台",
      dashboard_title: "TeleGuard 管理控制台",
      logout: "退出登录",
      save: "保存设置",
      cancel: "取消",
      close: "关闭",
      confirm: "确认",
      reset: "重置",
      search: "搜索",
      copy: "复制",
      action: "处置动作",
      actions: "操作",
      duration_mins: "禁言时长 (分钟)",
      status: "状态",
      enabled: "已开启",
      disabled: "已关闭",
      back: "返回",
      loading: "加载中...",
      or: "或",

      // 顶部导航切换
      mod_community: "社群管理",
      mod_draw: "抽奖中心 (Lucky Draw)",

      // 侧边栏导航
      nav_rules: "基础规则与视觉",
      nav_users: "用户数据管理",
      nav_history: "活动排行榜",
      nav_commands: "自定义指令",
      nav_spam: "安全与反垃圾",
      nav_captcha: "入群人机验证",
      nav_actions: "近期管理日志",

      // 登录界面
      login_title: "管理员登录",
      login_subtitle: "请选择以下方式之一完成身份验证",
      login_pass_placeholder: "请输入管理密码",
      login_pass_btn: "使用密码登录",
      login_error: "密码错误，请重新输入！",
      login_tg_btn: "通过 Telegram 授权登录",
      login_tg_step1: "请在 Telegram 打开 @Bot，然后发送以下验证码到 Bot 即可登录：",
      login_tg_step2: "你也可以点击以下按钮直接去验证：",
      login_tg_verify_btn: "去 Telegram 验证",

      // 安全与反垃圾
      spam_link_interceptor: "开启群组链接白名单拦截器",
      spam_whitelist_domains: "链接白名单域名 (每行一个，支持通配符如 *.x.com，覆盖 X, Reddit, Facebook 等主域名及短链接):",
      spam_ignored_topics: "免过滤主题 ID 列表 (多个用逗号或换行隔开，在这些主题下发言绝对不被反垃圾拦截):",

      rule_rtlo_title: "1. 拦截 RTLO 隐藏字符 (\\u202e)",
      rule_rtlo_desc: "检测文本中是否包含 Right-to-Left Override 字符。通常用于欺骗用户点击恶意钓鱼域名。",
      rule_action_label: "拦截动作",
      rule_duration_label: "禁言时长 (分钟)",
      action_ban: "拉黑 (Ban)",
      action_mute: "禁言 (Mute)",
      action_delete_only: "仅删消息 (Delete Only)",

      rule_new_user_title: "2. 新成员发链接限制",
      rule_new_user_desc: "限制群内新用户（Level 1 且 XP < 50）发送外部链接，防止小号发广告引流。",

      rule_cas_title: "3. Combot CAS 全球黑名单联动",
      rule_cas_desc: "对接 Combot 全球数据库，当用户发送首条消息时检测是否已被 Telegram 联盟拉黑。",

      rule_inline_keyboard_title: "4. 限制 Inline 自带键盘 (非管理员)",
      rule_inline_keyboard_desc: "拦截非管理员发送的带有自定义内联按钮的消息，防止群发控制或脚本引流。",

      rule_inline_bot_title: "5. 限制 Inline 机器人转发",
      rule_inline_bot_desc: "拦截通过 Inline 方式（如输入 @some_bot）发出的消息，支持配置豁免白名单。",
      rule_inline_bot_whitelist: "内联机器人白名单 (逗号分隔，如 gif, vote, like, poll):",
      rule_inline_bot_tip: "💡 说明: 此处填写的机器人（不需要带 @，如 gif, poll）将被豁免拦截，允许群员继续正常使用。",

      rule_keywords_title: "6. 敏感违规词自动拦截",
      rule_keywords_desc: "全字匹配消息及昵称、用户名。自动识别合并被空格/标点打碎的关键词（如“兼 职”、“兼.职”）。",
      rule_keywords_label: "敏感词库配置 (逗号分隔):",
      rule_keywords_placeholder: "例如: 兼职, 包赢, 导师, 资金盘, 空投, 私钥",

      rule_flood_title: "7. 防刷屏频率限制 (Flood Control)",
      rule_flood_desc: "限制单人在短时间内的最大连续发帖频率，若触发限制自动对其禁言处罚。",
      rule_flood_max_msgs: "消息数量上限",
      rule_flood_window: "时间窗口 (秒)",

      rule_emoji_title: "8. Emoji 表情密度限制",
      rule_emoji_desc: "限制单条消息中允许包含的最大 Emoji 图形数量，防止大量表情符号刷屏广告。",
      rule_emoji_max: "Emoji 数量上限",

      // 欢迎语与人机验证
      welcome_title: "🎉 群成员欢迎语设置",
      welcome_text_label: "欢迎语消息内容",
      captcha_scope_title: "🎯 验证与欢迎语作用域指定 (群组与 Topic)",
      captcha_math_label: "数学算术题 ({mention}, {timeout}, {group})",
      captcha_6char_label: "6位随机验证码 ({mention}, {timeout}, {group})",
      captcha_click_label: "单键点击验证 ({mention}, {timeout}, {group})",
      captcha_btn_text: "点击验证按钮文字",
      captcha_non_owner_alert: "非本人点击按钮弹窗提示",
      captcha_fail1_alert: "第1次回答错误提示",
      captcha_fail2_alert: "第2次回答错误踢出提示",

      // 抽奖中心
      draw_engine_label: "开关:",
      draw_engine_running: "运行中",
      draw_engine_sleeping: "休眠",
      draw_sleeping_curtain_tip: "抽奖引擎已休眠 · 请开启右上角【开关】解锁控制面板",
      draw_bot_token_title: "Telegram Bot Token 填写",
      draw_bot_token_desc: "Bot Token 仅保存在当前运行进程的内存中，绝不会持久化存储。服务重启后需重新填写。",
      draw_bjt_warning: "⚠️ 请注意按北京时间输入。不能早于当前时间。",
      draw_confirm_modal_title: "🎲 抽奖确认 / Draw Confirmation",
      draw_confirm_modal_sub: "请选择开奖模式，支持全随机开奖或手动指定获奖者",
      draw_confirm_camp_name: "活动名称:",
      draw_confirm_target_comm: "目标社群:",
      draw_confirm_prizes: "奖品设置:",
      draw_confirm_participants: "参与人数:",
      draw_confirm_mode_time: "开奖模式/时间:",
      draw_confirm_designated: "已预设指定:",
      draw_confirm_draw_now_q: "是否现在开奖？",
      draw_confirm_draw_now_desc: "可直接全随机开奖；或进入指定开奖后，选择立刻开奖或按定时开奖。",
      draw_btn_random_now: "立刻开奖 (全随机)",
      draw_btn_random_now_sub: "所有奖品全随机自动抽取并公布",
      draw_btn_designated: "指定开奖 (可指定中奖者与奖品)",
      draw_btn_designated_sub: "可指定中奖者，之后选择直接开奖或按定时开奖",
      draw_btn_cancel_back: "取消 (返回)",
      draw_quota_total: "奖品总配额:",
      draw_quota_assigned: "已指定:",
      draw_quota_remaining: "剩余自动随机抽:",
      draw_quota_tip: "💡 从下方添加要指定的参与者与所获奖品。指定人数不能超过总奖品数；若指定人数少于总奖品数，剩余奖品将在开奖时从剩余参与者中随机抽取。",
      draw_btn_add_designated: "➕ 添加指定获奖者",
      draw_btn_clear_designated: "清空指定 (恢复纯随机)",
      draw_limit_reached: "已达总奖品数上限",
      draw_auto_time_label: "⏰ 自动开奖时间 (UTC+8):",
      draw_auto_time_sub: "未设定时，可在此设置时间并按定时开奖",
      draw_btn_draw_scheduled: "⏰ 按照 Auto Draw 时间开奖",
      draw_btn_draw_now_instant: "⚡ 立刻开奖",
      draw_picker_title: "选择指定中奖者",
      draw_picker_search_placeholder: "搜索电报用户名 (@username) 或昵称...",
      draw_picker_total_prefix: "位参与者",
      draw_picker_match_prefix: "匹配",
      draw_picker_case_note: "支持用户名/昵称不区分大小写",
      draw_copy_template: "📋 复制",
      draw_copy_template_title: "复制此活动为新模板",
      draw_designated_badge: "🎯 已预设",
      draw_registered_suffix: "人已报名",
      draw_auto_draw_suffix: "(自动开奖)",
      draw_ended_suffix: "(活动结束)",
      draw_manual_draw: "手动开奖",

      // 帮助文档说明
      doc_action_defs: "🛡️ 处置动作说明",
      doc_ban_desc: "踢出违规者并永久拉黑，除非管理员手动解封否则无法再次入群。",
      doc_mute_desc: "限制用户发送消息、媒体或链接。可设临时禁言时长（到期自动解封）或永久禁言。",
      doc_delete_desc: "仅立即撤回删除违规消息，不对用户执行禁言或封禁处置。",
      doc_safety_rules: "⚙️ 6 大防御机制与刷屏限制",
      doc_rtlo_rule: "1. RTLO 字符检测",
      doc_new_user_rule: "2. 新人发链接限制",
      doc_cas_rule: "3. Combot CAS 全球黑名单",
      doc_inline_kb_rule: "4. 限制 Inline Keyboards 键盘",
      doc_inline_bot_rule: "5. 限制 Inline 机器人",
      doc_keywords_rule: "6. 敏感词自动拦截",
      doc_flood_rule: "7. 防刷屏限制",

      // 弹窗与提示
      toast_engine_woken: "⚡ 抽奖引擎已成功唤醒！自动开奖调度器已启动。",
      toast_engine_slept: "💤 抽奖引擎已进入休眠模式：0 内存占用。",
      toast_toggle_failed: "切换抽奖引擎状态失败: ",
      toast_engine_auto_woken: "⚡ 抽奖引擎已自动唤醒！",
      toast_draw_success: "🎉 开奖成功！中奖者已抽取并推送到社群。",
      alert_set_autodraw_time: "⚠️ 请设置自动开奖时间 (UTC+8)！",
      alert_invalid_time_format: "⚠️ 自动开奖时间格式无效，请重新选择！",
      alert_time_cannot_be_past: "⚠️ 自动开奖时间不能早于当前时间！请设置未来的开奖时间。",
      alert_wake_failed: "唤醒抽奖引擎失败: ",
      alert_draw_failed: "开奖失败: ",
      alert_no_participants: "当前暂无用户参与本次抽奖，无法指定中奖者！",
      confirm_wake_and_publish: "⚠️ 抽奖引擎当前处于休眠状态（后台自动开奖调度器已停用）。\n\n发布活动后需要引擎处于运行状态才能自动结算与推送。\n\n是否立即一键唤醒抽奖引擎并发布活动？",
      confirm_wake_and_draw: "⚠️ 抽奖引擎当前处于休眠状态。\n\n执行开奖并宣布中奖者需要引擎处于运行状态。\n\n是否立即唤醒引擎并进入开奖确认？",

      // 动态抽奖词条
      draw_no_match_participant: "没有搜索到匹配的参与者",
      draw_already_assigned: "已在其他行指定",
      draw_currently_selected: "当前已选",
      draw_btn_select: "选择",
      draw_alert_limit_reached: "已达总奖品数上限，不可再添加。",
      draw_alert_all_assigned: "所有参与者均已指定，不可再添加。",
      draw_click_select_winner: "点击选择或搜索中奖者",
      draw_btn_open_search: "展开搜索",
      draw_btn_remove: "移除",
      draw_status_over: "超额",
      draw_status_full: "已选满",
      draw_status_remaining: "剩",
      draw_all_participants_done: "所有参与者均已指定完毕",
      draw_alert_duplicate_user: "⚠️ 参与者已被重复指定，每位用户在同一场抽奖中只能中奖一次！",
      draw_alert_prize_quota_exceeded: "⚠️ 已超出奖品数量上限！",
      draw_alert_need_autodraw_time: "⚠️ 按照定时开奖需要设置自动开奖时间，请在上方选择开奖时间！",
      draw_btn_saving: "保存中...",
      draw_toast_save_success: "✅ 已成功保存指定获奖者！将在自动开奖时间自动开奖并公布。",
      draw_toast_random_saved: "✅ 已保存纯随机开奖配置！将在自动开奖时间自动全随机开奖并公布。",
      draw_alert_save_failed: "保存失败: ",
      draw_btn_drawing: "正在开奖...",
      draw_drawing_broadcasting: "⏳ 正在随机开奖并推送...",
      draw_server_conn_failed: "后台服务连接失败 (Failed to fetch)。请确认 Node.js 后台服务正在运行。",

      draw_current_bjt: "当前北京",
      draw_prizes_unit: "份",
      draw_no_scheduled_time: "未预设定时时间",
      draw_set_time_and_schedule: "⏰ 设置时间并按定时开奖",
      draw_search_user_or_nickname: "搜索用户名或昵称...",
      draw_expand_search_modal: "展开弹窗搜索",
      draw_btn_expand: "展开",
      // 排行榜
      lb_activity_ranking: "活跃度榜单",
      lb_weekly: "周榜",
      lb_all_time: "总榜",
      lb_loading: "正在加载排行榜...",
      lb_you: "你",
      lb_footer_loading: "加载中...",
      lb_empty: "该统计周期暂无发言记录。",
      lb_error: "获取排行榜数据失败。",

      // 语言切换按钮文案
      lang_switch_btn: "简体中文"
    }
  };

  // Determine language: Check localStorage first, default strictly to 'en'
  let currentLang = localStorage.getItem(STORAGE_KEY) || "en";
  if (currentLang !== "en" && currentLang !== "zh") {
    currentLang = "en";
  }

  function getLang() {
    return currentLang;
  }

  function t(key, fallback = "") {
    const dict = resources[currentLang] || resources.en;
    if (dict && dict[key] !== undefined) {
      return dict[key];
    }
    // Fallback to English dictionary
    if (resources.en && resources.en[key] !== undefined) {
      return resources.en[key];
    }
    return fallback || key;
  }

  function setLanguage(lang) {
    if (lang !== "en" && lang !== "zh") return;
    currentLang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      console.warn("Failed to persist language:", e);
    }
    applyTranslations();
    updateSwitchersUI();

    // Trigger custom event for dynamic modules
    window.dispatchEvent(new CustomEvent("teleguard_lang_changed", { detail: { lang } }));
  }

  function toggleLanguage() {
    setLanguage(currentLang === "en" ? "zh" : "en");
  }

  function applyTranslations(root = document) {
    // 1. Text content
    const elements = root.querySelectorAll("[data-i18n]");
    elements.forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const text = t(key);
      if (text) {
        el.textContent = text;
      }
    });

    // 2. HTML content
    const htmlElements = root.querySelectorAll("[data-i18n-html]");
    htmlElements.forEach((el) => {
      const key = el.getAttribute("data-i18n-html");
      const html = t(key);
      if (html) {
        el.innerHTML = html;
      }
    });

    // 3. Placeholders
    const placeholderElements = root.querySelectorAll("[data-i18n-placeholder]");
    placeholderElements.forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const ph = t(key);
      if (ph) {
        el.setAttribute("placeholder", ph);
      }
    });

    // 4. Titles / Tooltips
    const titleElements = root.querySelectorAll("[data-i18n-title]");
    titleElements.forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      const title = t(key);
      if (title) {
        el.setAttribute("title", title);
      }
    });

    // 5. Update HTML lang attribute
    document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
  }

  function updateSwitchersUI() {
    const switchers = document.querySelectorAll(".lang-switch-btn");
    switchers.forEach((btn) => {
      const labelEl = btn.querySelector(".lang-switch-label");
      if (labelEl) {
        labelEl.textContent = currentLang === "en" ? "English" : "简体中文";
      } else {
        btn.textContent = currentLang === "en" ? "🌐 English" : "🌐 简体中文";
      }
      btn.setAttribute("title", currentLang === "en" ? "Switch to 中文" : "Switch to English");
    });
  }

  // Auto-init on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      applyTranslations();
      updateSwitchersUI();
    });
  } else {
    applyTranslations();
    updateSwitchersUI();
  }

  // Expose global i18n API
  window.i18n = {
    t,
    getLang,
    setLanguage,
    toggle: toggleLanguage,
    applyTranslations,
    updateSwitchersUI,
    resources
  };
})();
