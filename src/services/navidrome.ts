import axios, { AxiosInstance } from 'axios';
import md5 from 'md5';
import { config } from '../config';
import { Song, Playlist, NavidromeResponse } from '../types';
import qs from 'qs';

/**
 * Navidrome 客户端封装
 * 负责与 Subsonic API 进行底层交互，包括认证、请求封装和数据清洗。
 */
export class NavidromeClient {
    private client: AxiosInstance;
    private baseUrl: string;
    private user: string;
    private pass: string;

    constructor() {
        this.baseUrl = config.navidrome.url;
        this.user = config.navidrome.user;
        this.pass = config.navidrome.pass;

        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000,
            // 关键修正: Navidrome/Subsonic 需要 songsId=1&songId=2 格式，不可带 []
            paramsSerializer: params => qs.stringify(params, { arrayFormat: 'repeat' })
        });
    }

    /**
     * 生成 Subsonic API 认证参数
     * Subsonic 认证机制: md5(password + salt)
     */
    private getAuthParams(options?: { noFormat?: boolean }) {
        const salt = Math.random().toString(36).substring(2, 10);
        const token = md5(this.pass + salt);
        const params: Record<string, string> = {
            u: this.user,
            t: token,
            s: salt,
            v: '1.16.1', // Subsonic 协议版本
            c: 'NaviMuse', // 客户端标识
        };

        if (!options?.noFormat) {
            params.f = 'json';
        }

        return params;
    }

    /**
     * 通用请求封装
     * 处理认证注入、错误捕获和响应解包
     */
    private async request<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
        const auth = this.getAuthParams();
        try {
            const response = await this.client.get<NavidromeResponse<T>>(`/rest/${endpoint}`, {
                params: { ...auth, ...params },
            });

            // Subsonic 总是返回 200 OK，需要检查 body 中的 status
            const { status, error } = response.data['subsonic-response'];
            if (status === 'failed') {
                throw new Error(`Navidrome API Error: ${error?.message} (Code: ${error?.code})`);
            }

            return response.data['subsonic-response'] as unknown as T;
        } catch (err: any) {
            console.error(`Request failed for ${endpoint}:`, err.message);
            throw err;
        }
    }

    // --- 核心业务方法 ---

    /**
     * 连通性测试 (Ping)
     */
    async ping(): Promise<boolean> {
        try {
            await this.request('ping.view');
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * 获取随机歌曲 (Discovery 基础)
     * @param count 获取数量
     */
    async getRandomSongs(count = 20): Promise<Song[]> {
        const res = await this.request<any>('getRandomSongs.view', { size: count });
        // Subsonic 结构: { randomSongs: { song: [...] } }
        const songs = res.randomSongs?.song || [];
        return songs.map(this.normalizeSong);
    }

    /**
     * 获取用户标星/红心歌曲 (User Taste 基础)
     * 注意：全量拉取可能较慢，当前限制 500 首
     */
    async getStarred(): Promise<Song[]> {
        const res = await this.request<any>('getStarred.view', { size: 500 });
        // res.starred 可能包含 song, album, artist，我们只取 song
        const songs = res.starred?.song || [];
        return songs.map(this.normalizeSong);
    }

    /**
     * 获取专辑列表
     * @param type 列表类型: random, newest, frequent, recent, starred, alphabetByNameAndArtist
     * @param size 数量
     */
    async getAlbumList(type: string = 'frequent', size: number = 10): Promise<any[]> {
        const res = await this.request<any>('getAlbumList.view', { type, size });
        return res.albumList?.album || [];
    }

    /**
     * 获取专辑详情 (包含歌曲)
     */
    async getAlbum(id: string): Promise<Song[]> {
        const res = await this.request<any>('getAlbum.view', { id });
        const songs = res.album?.song || [];
        return songs.map(this.normalizeSong);
    }

    /**
     * 获取常听歌曲 (基于常听专辑推断)
     * 策略: 获取 Top N 常听专辑，然后拉取这些专辑的所有歌曲
     * @param albumLimit 采样的常听专辑数量
     */
    async getMostPlayed(albumLimit: number = 5): Promise<Song[]> {
        try {
            // 1. 获取常听专辑
            const albums = await this.getAlbumList('frequent', albumLimit);
            if (!albums.length) return [];

            // 2. 并行获取专辑内歌曲
            const tasks = albums.map(album => this.getAlbum(album.id));
            const albumSongsList = await Promise.all(tasks);

            // 3. 展平并去重
            const allSongs = albumSongsList.flat();

            // 简单按播放次数降序 (虽然 getAlbumList 已经是 frequent，但歌曲层面再排一次更稳)
            return allSongs.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
        } catch (e) {
            console.warn('[Navidrome] Failed to fetch most played songs:', e);
            return [];
        }
    }

    /**
     * 创建或更新歌单
     * Subsonic 的 createPlaylist 实际上是 "新建"，如果同名不会覆盖而是新建一个。
     * @param name 歌单名称
     * @param songIds 歌曲ID列表
     */
    async createPlaylist(name: string, songIds: string[]): Promise<Playlist> {
        const res = await this.request<any>('createPlaylist.view', {
            name,
            songId: songIds // 即将被序列化为 songId=1&songId=2
        });
        return res.playlist;
    }

    /**
     * 获取所有歌单
     */
    async getPlaylists(): Promise<Playlist[]> {
        const res = await this.request<any>('getPlaylists.view');
        // Subsonic structure: { playlists: { playlist: [...] } }
        const playlists = res.playlists?.playlist || [];
        return playlists.map((p: any) => ({
            id: p.id,
            name: p.name,
            songCount: p.songCount,
            duration: p.duration,
            created: p.created
        }));
    }

    /**
     * 获取指定歌单详情 (含歌曲)
     */
    async getPlaylist(id: string): Promise<{ playlist: Playlist; songs: Song[] }> {
        const res = await this.request<any>('getPlaylist.view', { id });
        const rawPlaylist = res.playlist;

        if (!rawPlaylist) {
            throw new Error('Playlist not found');
        }

        const playlist: Playlist = {
            id: rawPlaylist.id,
            name: rawPlaylist.name,
            songCount: rawPlaylist.songCount,
            duration: rawPlaylist.duration,
            created: rawPlaylist.created
        };

        const songs = (rawPlaylist.entry || []).map(this.normalizeSong);

        return { playlist, songs };
    }

    /**
     * 删除歌单
     */
    async deletePlaylist(id: string): Promise<void> {
        await this.request('deletePlaylist.view', { id });
    }

    /**
     * 收藏歌曲 (Star)
     * @param id 歌曲 ID
     */
    async starSong(id: string): Promise<void> {
        await this.request('star.view', { id });
    }

    /**
     * 取消收藏歌曲 (Unstar)
     * @param id 歌曲 ID
     */
    async unstarSong(id: string): Promise<void> {
        await this.request('unstar.view', { id });
    }

    /**
     * 数据清洗：将 Subsonic 原始数据转为内部 Song 类型
     */
    private normalizeSong(raw: any): Song {
        return {
            id: raw.id,
            title: raw.title,
            artist: raw.artist,
            album: raw.album,
            genre: raw.genre,
            duration: raw.duration,
            playCount: raw.playCount || 0,
            created: raw.created,
            starred: !!raw.starred,
            type: raw.suffix,
            path: raw.path
        };
    }
    /**
     * 获取音频流代理所需参数
     */
    getStreamUrl(id: string): string {
        // stream.view is a binary endpoint, 'f=json' might confuse some servers or proxies
        const auth = this.getAuthParams({ noFormat: true });

        // Ensure no double slash if baseUrl has one
        const cleanBase = this.baseUrl.replace(/\/+$/, '');

        const params = qs.stringify({ ...auth, id: id });
        const url = `${cleanBase}/rest/stream.view?${params}`;

        console.log(`[NavidromeClient] Generated Stream URL: ${cleanBase}/rest/stream.view?id=${id}&u=...`);
        return url;
    }
}

export const navidromeClient = new NavidromeClient();
