
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserProfileService } from '../src/services/recommendation/UserProfileService';
// Mock dependencies BEFORE import
vi.mock('../src/services/navidrome', () => ({
    navidromeClient: {
        getStarred: vi.fn(),
    }
}));
vi.mock('../src/db', () => ({
    userProfileRepo: {
        getSongVector: vi.fn(),
        upsertProfile: vi.fn(),
    },
    metadataRepo: {}
}));
vi.mock('../src/config', () => ({
    config: { app: { profileSampleSize: 50 } }
}));
vi.mock('../src/services/recommendation/RecommendationService', () => ({
    recommendationService: {
        analyzeUserProfile: vi.fn()
    }
}));

import { userProfileService } from '../src/services/recommendation/UserProfileService';
import { navidromeClient } from '../src/services/navidrome';
import { userProfileRepo } from '../src/db';
import { recommendationService } from '../src/services/recommendation/RecommendationService';

describe('UserProfileService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should calculate centroid correctly for starred songs', async () => {
        // Setup Mocks
        const mockSongs = [
            { id: '1', title: 'Song A', artist: 'Artist A', genre: 'Pop' },
            { id: '2', title: 'Song B', artist: 'Artist B', genre: 'Rock' }
        ];
        (navidromeClient.getStarred as any).mockResolvedValue(mockSongs);

        // Mock Vectors (Size 768)
        const vec1 = new Float32Array(768).fill(0);
        vec1[0] = 1.0;

        const vec2 = new Float32Array(768).fill(0);
        vec2[0] = 0.0;
        vec2[1] = 1.0;

        (userProfileRepo.getSongVector as any).mockImplementation((id: string) => {
            if (id === '1') return vec1;
            if (id === '2') return vec2;
            return null;
        });

        // Mock AI Success
        (recommendationService.analyzeUserProfile as any).mockResolvedValue({
            technical_profile: { summary_tags: ['AI_Tag'] },
            display_card: { title: 'AI Generated' }
        });

        // Execute
        const result = await userProfileService.syncUserProfile('test_user');

        // Verify
        expect(navidromeClient.getStarred).toHaveBeenCalled();
        expect(userProfileRepo.upsertProfile).toHaveBeenCalledTimes(1);

        const callArgs = (userProfileRepo.upsertProfile as any).mock.calls[0];
        const userId = callArgs[0];
        const profileData = callArgs[1];

        expect(userId).toBe('test_user');

        // Verify Vector Calculation
        // Expected: (1+0)/2 = 0.5, (0+1)/2 = 0.5
        const savedVector = new Float32Array(profileData.taste_vector || profileData.vector); // handle param name mismatch if any
        expect(savedVector[0]).toBeCloseTo(0.5);
        expect(savedVector[1]).toBeCloseTo(0.5);
        expect(savedVector[2]).toBe(0);

        // Verify JSON Structure
        expect(result).toBeDefined();
        if (!result) throw new Error("Result is undefined");

        // Should use AI result
        expect(result.display_card.title).toBe('AI Generated');
        // Taste Vector should still be calculated
        expect(savedVector[0]).toBeCloseTo(0.5);
    });

    it('should handle missing vectors gracefully', async () => {
        // Setup Mocks
        const mockSongs = [
            { id: '3', title: 'Song C', artist: 'Artist C', genre: 'Jazz' }
        ];
        (navidromeClient.getStarred as any).mockResolvedValue(mockSongs);
        (userProfileRepo.getSongVector as any).mockReturnValue(null); // No vector found
        // Mock AI Failure for Fallback
        (recommendationService.analyzeUserProfile as any).mockRejectedValue(new Error("AI Error"));

        // Execute
        const result = await userProfileService.syncUserProfile('test_user_empty');

        // Verify
        const callArgs = (userProfileRepo.upsertProfile as any).mock.calls[0];
        const profileData = callArgs[1];
        const savedVector = new Float32Array(profileData.vector);

        // Should be all zeros
        // Should be all zeros
        expect(savedVector[0]).toBe(0);
        // JSON should still be generated (Fallback)
        expect(result).toBeDefined();
        if (!result) throw new Error("Result is undefined");
        expect(result.technical_profile.summary_tags).toContain('Jazz');
        expect(result.display_card.title).toContain('Fallback');
    });
});
