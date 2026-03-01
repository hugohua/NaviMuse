import generatedTags from './generated_tags.json';

export interface TagCategory {
    title: string;
    attributes: Record<string, string>;
}

// 手工策划的 Vibe Tags（与 index.html 保持一致）
export const manualTagCategories: TagCategory[] = [
    {
        title: "场景 / 氛围",
        attributes: {
            "动感健身": "High energy, BPM > 120, Bass-heavy, EDM, Rock, Pop-Punk.",
            "Chill 放松": "Lo-Fi, R&B, Reggae, Neo-Soul, Acoustic. Relaxed vibe, no harsh sounds.",
            "快乐时光": "Bubblegum Pop, Major key, Bright vocals, K-Pop, J-Pop (Anime), Disney.",
            "深夜 EMO": "Melancholic, Slow tempo, Minor key, Ballads, Sad Pop. Focus on lyrics and piano/strings.",
            "助眠模式": "Instrumental (Piano, Ambient, White Noise), Classical, New Age. Minimal or no vocals.",
            "洗澡": "Guilty Pleasures, High vocal range, sing-along anthems, classic Mandopop/Cantopop.",
            "通勤必听": "Upbeat Pop, Podcast-friendly, story-driven Indie, steady rhythm for commuting.",
            "失恋必听": "Heartbreak songs, emotional vocals, slow tempo, cathartic.",
            "躺平": "Lazy, slow, R&B, Dream Pop, unrelated to stress.",
            "打扫": "High energy, BPM > 120, Bass-heavy, EDM, Rock.",
            "打游戏": "High energy, focus-enhancing, synth-heavy, gaming soundtracks.",
            "驾车": "Upbeat, steady rhythm (Synthwave, Classic Rock, Indie Pop), keeps the user awake but not stressed.",
            "专注模式": "Instrumental, Lo-Fi, Classical, Post-Rock. No distracting vocals.",
            "起床": "Bright, uplifting, gentle start building to energy, Morning Jazz or Pop.",
            "佛系时间": "New Age, Ambient, Zen, Guqin, minimal interaction.",
            "摸鱼": "Background music, Indie, Lo-Fi, Soft Pop. Not distracting but keeps mood up.",
            "雨天": "Jazzy, Lo-Fi, Acoustic, Melancholic, soft rain sounds compatible.",
            "海边": "Tropical House, Reggae, Acoustic Guitar, breezy, sunny vibe.",
            "旅行": "Upbeat, road-trip vibe, sing-along anthems, breezy Pop/Rock."
        }
    },
    {
        title: "风格 / 流派",
        attributes: {
            "劲": "High energy, aggressive heavy bass, club bangers.",
            "粤语": "Hong Kong Classics (80s/90s/00s) or modern Canto-Pop. Nostalgic vibe.",
            "治愈": "Warm vocals, Acoustic, Folk, Soft Pop, comforting lyrics.",
            "DJ模式": "Club DJ sets, seamless transitions, House, Techno, progressive builds.",
            "抖音漫游": "Viral hits, 'Phonk', catchy hooks, meme songs, highly rhythmic, short duration preferred.",
            "电音": "Electronic Dance Music, Synth-heavy, EDM, Future Bass, Trance.",
            "国风": "Traditional Chinese instruments (Guzheng, Erhu) mixed with Pop/Electronic (China-Chic).",
            "说唱": "Hip-Hop, Rap, rhythmic flow, strong beats.",
            "沉浸0.8x": "Vaporwave, Slowed + Reverb, deep vocals, atmospheric electronic.",
            "轻音乐": "Easy Listening, Instrumental, Classical crossover, Bossa Nova.",
            "小酒馆": "Jazz, Bossa Nova, sophisticated, warm atmosphere, soft vocals.",
            "KTV必点": "Karaoke classics, emotional ballads, high vocal range, clear lyrics.",
            "浪漫情歌": "Romantic love songs, sweet duets, tender ballads, wedding-style Pop.",
            "摇滚": "Rock, Alternative, heavy drums, electric guitar.",
            "R&B": "Rhythm and Blues, smooth vocals, groovy beats, Neo-Soul, contemporary R&B.",
            "怀旧老歌": "80s/90s/00s Golden Era Pop (Mandarin/English). Nostalgia factor is key.",
            "民谣": "Folk, Acoustic Guitar, storytelling lyrics.",
            "甜美女声": "Sweet vocals, C-Pop/J-Pop, cute vibe, light instrumentation.",
            "K-pop": "Korean Pop, idol groups, catchy hooks, highly produced, dance-oriented.",
            "日语": "J-Pop, J-Rock, Anime OST, City Pop, Japanese vocals.",
            "儿歌": "Kids, Nursery Rhymes, simple melodies.",
            "乡村": "Country, Americana, Steel Guitar, storytelling, warm Southern vibes.",
            "古典": "Classical, Orchestra, Piano/Violin solos."
        }
    }
];

// 合并导出: 数据库生成标签 + 手工策划标签
export const tagCategories: TagCategory[] = [
    ...(generatedTags as unknown as TagCategory[]),
    ...manualTagCategories
];
