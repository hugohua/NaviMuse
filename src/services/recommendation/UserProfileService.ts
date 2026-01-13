
import { navidromeClient } from '../navidrome';
import { userProfileRepo, metadataRepo } from '../../db';
import { config } from '../../config';
import { recommendationService } from './RecommendationService';

export class UserProfileService {

    /**
     * Synchronize User Profile (Phase 1)
     * Fetches Starred songs, calculates Taste Vector, and updates Profile JSON.
     * @param userId Internal User ID (default 'admin')
     */
    async syncUserProfile(userId: string = 'admin') {
        console.log(`[UserProfile] Syncing profile for user: ${userId}...`);

        // 1. Fetch User Signals (Starred Songs)
        // Note: In Phase 1 we focus on Starred.
        console.log(`[UserProfile] Fetching starred songs...`);
        const starredSongs = await navidromeClient.getStarred();

        if (starredSongs.length === 0) {
            console.log(`[UserProfile] No starred songs found. Skipping profile generation.`);
            return;
        }

        console.log(`[UserProfile] Found ${starredSongs.length} starred songs.`);

        // 2. Calculate Taste Vector (Centroid)
        // Iterate through starred songs, get their local vectors from DB.
        let vectorSum = new Float32Array(768).fill(0);
        let validVectors = 0;

        for (const song of starredSongs) {
            const vector = userProfileRepo.getSongVector(song.id);
            if (vector) {
                // Determine weight?
                // Phase 1: Simple Average.
                // Phase 2: Time Decay (Future)
                for (let i = 0; i < 768; i++) {
                    vectorSum[i] += vector[i];
                }
                validVectors++;
            }
        }

        let tasteVector: Float32Array;
        if (validVectors > 0) {
            tasteVector = vectorSum.map(v => v / validVectors);
            console.log(`[UserProfile] Calculated Taste Vector from ${validVectors} songs.`);
        } else {
            console.warn(`[UserProfile] No vectors found for starred songs. Maybe metadata sync needed?`);
            // If we can't calculate vector, we can still generate JSON profile if metadata exists.
            tasteVector = new Float32Array(768).fill(0);
        }

        // 3. Generate Semantic Profile (AI Powered)
        // [中文注释] 使用 RecommendationService (Prompt 5.0) 生成深度画像
        // 替换旧的 Heuristic Logic (getTopGenres -> AI Analysis)

        let userProfileObj;
        try {
            // Note: We scan all starred songs, or limit to config.profileSampleSize inside specific logic if needed?
            // recommendationService.analyzeUserProfile handles `songsCSV` internally but we pass raw songs.
            // Let's pass top 100 recent starred to avoid token overflow if user has 1000 stared.
            const recentStarred = starredSongs.slice(0, 100);
            userProfileObj = await recommendationService.analyzeUserProfile(recentStarred);
            console.log(`[UserProfile] AI Analysis Success. Title: ${userProfileObj.display_card.title}`);
        } catch (error) {
            console.error("[UserProfile] AI Analysis Failed, falling back to heuristics:", error);
            // Fallback Logic (Phase 1)
            const topGenres = this.getTopGenres(starredSongs);
            const topArtists = this.getTopArtists(starredSongs);

            userProfileObj = {
                technical_profile: {
                    summary_tags: topGenres,
                    taste_anchors: topArtists.slice(0, 5),
                    dimensions: {
                        era_preference: "Unknown",
                        energy_level: "0.5 (Heuristic)",
                        acoustic_environment: "Unknown"
                    },
                    blacklist_inference: []
                },
                display_card: {
                    title: "The Eclectic Listener (Fallback)",
                    message: "AI service currently unavailable. Based on your stats, you enjoy " + (topGenres[0] || 'Music') + "."
                }
            };
        }

        const jsonProfile = JSON.stringify(userProfileObj);

        // 4. Save to DB
        userProfileRepo.upsertProfile(userId, {
            json: jsonProfile,
            vector: tasteVector
        });

        console.log(`[UserProfile] Profile saved for ${userId}.`);

        return userProfileObj; // Return Object directly as before (it was parsing before return)
    }

    private getTopArtists(songs: any[]): string[] {
        const counts: Record<string, number> = {};
        songs.forEach(s => counts[s.artist] = (counts[s.artist] || 0) + 1);
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([k]) => k);
    }

    private getTopGenres(songs: any[]): string[] {
        const counts: Record<string, number> = {};
        songs.forEach(s => {
            if (s.genre) counts[s.genre] = (counts[s.genre] || 0) + 1;
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([k]) => k);
    }
}

export const userProfileService = new UserProfileService();
