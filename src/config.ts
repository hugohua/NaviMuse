import dotenv from 'dotenv';
import path from 'path';

// Load .env from root
dotenv.config({ path: path.join(__dirname, '../.env') });

const getEnv = (key: string, required = true): string => {
    const value = process.env[key];
    if (!value && required) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return value || '';
};

export const config = {
    navidrome: {
        url: getEnv('ND_URL'),
        user: getEnv('ND_USER'),
        pass: getEnv('ND_PASS'), // Can be token or hex encoded password
    },
    ai: {
        apiKey: getEnv('OPENAI_API_KEY'),
        baseURL: getEnv('OPENAI_BASE_URL') || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: getEnv('OPENAI_MODEL') || 'qwen3-max',
    },
    app: {
        port: parseInt(process.env.PORT || '3000', 10),
        profileSampleSize: 200, // Number of songs to analyze for user profile
    }
};

export interface TagCategory {
    title: string;
    attributes: Record<string, string>;
}

export const promptConfig = {
    tagCategories: [
        {
            title: "场景 / 氛围 (Context)",
            attributes: {
                "动感健身": "High energy, BPM > 120, Bass-heavy, EDM, Rock, Pop-Punk.",
                "打扫": "High energy, BPM > 120, Bass-heavy, EDM, Rock.",
                "驾车": "Upbeat, steady rhythm (Synthwave, Classic Rock, Indie Pop), keeps the user awake but not stressed.",
                "旅行": "Upbeat, road-trip vibe, sing-along anthems, breezy Pop/Rock.",
                "起床": "Bright, uplifting, gentle start building to energy, Morning Jazz or Pop.",
                "洗澡": "Guilty Pleasures, High vocal range, sing-along anthems, classic Mandopop/Cantopop.",
                "KTV必点": "Karaoke classics, emotional ballads, high vocal range, clear lyrics.",
                "摸鱼": "Background music, Indie, Lo-Fi, Soft Pop. Not distracting but keeps mood up.",
                "打游戏": "High energy, focus-enhancing, synth-heavy, gaming soundtracks."
            }
        },
        {
            title: "情绪 / 状态 (Mood)",
            attributes: {
                "深夜 EMO": "Melancholic, Slow tempo, Minor key, Ballads, Sad Pop. Focus on lyrics and piano/strings.",
                "失恋必听": "Heartbreak songs, emotional vocals, slow tempo, cathartic.",
                "雨天": "Jazzy, Lo-Fi, Acoustic, Melancholic, soft rain sounds compatible.",
                "Chill 放松": "Lo-Fi, R&B, Reggae, Neo-Soul, Acoustic. Relaxed vibe, no harsh sounds.",
                "躺平": "Lazy, slow, R&B, Dream Pop, unrelated to stress.",
                "海边": "Tropical House, Reggae, Acoustic Guitar, breezy, sunny vibe.",
                "助眠模式": "Instrumental (Piano, Ambient, White Noise), Classical, New Age. Minimal or no vocals.",
                "专注模式": "Instrumental, Lo-Fi, Classical, Post-Rock. No distracting vocals.",
                "佛系时间": "New Age, Ambient, Zen, Guqin, minimal interaction.",
                "治愈": "Warm vocals, Acoustic, Folk, Soft Pop, comforting lyrics.",
                "小酒馆": "Jazz, Bossa Nova, sophisticated, warm atmosphere, soft vocals.",
                "轻音乐": "Easy Listening, Instrumental, Classical crossover, Bossa Nova."
            }
        },
        {
            title: "风格 / 流派 (Genre)",
            attributes: {
                "抖音漫游": "Viral hits, 'Phonk', catchy hooks, meme songs, highly rhythmic, short duration preferred.",
                "沉浸0.8x": "Vaporwave, Slowed + Reverb, deep vocals, atmospheric electronic.",
                "快乐时光": "Bubblegum Pop, Major key, Bright vocals, K-Pop, J-Pop (Anime), Disney.",
                "甜美女声": "Sweet vocals, C-Pop/J-Pop, cute vibe, light instrumentation.",
                "国风": "Traditional Chinese instruments (Guzheng, Erhu) mixed with Pop/Electronic (China-Chic).",
                "粤语": "Hong Kong Classics (80s/90s/00s) or modern Canto-Pop. Nostalgic vibe.",
                "怀旧老歌": "80s/90s/00s Golden Era Pop (Mandarin/English). Nostalgia factor is key.",
                "说唱": "Hip-Hop, Rap, rhythmic flow, strong beats.",
                "摇滚": "Rock, Alternative, heavy drums, electric guitar.",
                "民谣": "Folk, Acoustic Guitar, storytelling lyrics.",
                "古典": "Classical, Orchestra, Piano/Violin solos.",
                "儿歌": "Kids, Nursery Rhymes, simple melodies.",
                "劲": "High energy, aggressive heavy bass, club bangers."
            }
        }
    ] as TagCategory[]
};
