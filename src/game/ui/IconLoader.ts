import { getIconData } from '@iconify/utils';
import lucideData from '@iconify/json/json/lucide.json';

/**
 * Icon loader and cache system for rendering SVG icons on canvas
 */
export class IconLoader {
    private imageCache: Map<string, HTMLImageElement> = new Map();
    private loadingPromises: Map<string, Promise<HTMLImageElement>> = new Map();

    /**
     * Get an icon as an HTMLImageElement, with caching
     * @param iconName - Name of the icon (e.g., 'oak', 'stone-pile', 'wheat')
     * @param color - Optional color to apply to the icon (hex format)
     * @param size - Size in pixels (default: 64)
     */
    async getIcon(iconName: string, color?: string, size: number = 64): Promise<HTMLImageElement | null> {
        const cacheKey = `${iconName}-${color || 'default'}-${size}`;

        // Return cached image if available
        if (this.imageCache.has(cacheKey)) {
            return this.imageCache.get(cacheKey)!;
        }

        // Return existing loading promise if in progress
        if (this.loadingPromises.has(cacheKey)) {
            return this.loadingPromises.get(cacheKey)!;
        }

        // Create new loading promise
        const loadingPromise = this.loadIcon(iconName, color, size);
        this.loadingPromises.set(cacheKey, loadingPromise);

        try {
            const image = await loadingPromise;
            this.imageCache.set(cacheKey, image);
            this.loadingPromises.delete(cacheKey);
            return image;
        } catch (error) {
            console.error(`Failed to load icon: ${iconName}`, error);
            this.loadingPromises.delete(cacheKey);
            return null;
        }
    }

    /**
     * Load an icon from the Game Icons collection
     */
    private async loadIcon(iconName: string, color?: string, size: number = 64): Promise<HTMLImageElement> {
        // Get icon data from the Game Icons collection
        const iconData = getIconData(lucideData as any, iconName);

        if (!iconData) {
            throw new Error(`Icon not found: ${iconName}`);
        }

        // Build SVG string
        const svg = this.buildSVG(iconData, color, size);

        // Convert SVG to Image
        return this.svgToImage(svg);
    }

    /**
     * Build an SVG string from icon data
     */
    private buildSVG(iconData: any, color?: string, size: number = 64): string {
        const body = iconData.body;
        const width = iconData.width || 512;
        const height = iconData.height || 512;
        const fillColor = color || 'currentColor';

        return `
      <svg xmlns="http://www.w3.org/2000/svg" 
           width="${size}" 
           height="${size}" 
           viewBox="0 0 ${width} ${height}"
           fill="${fillColor}">
        ${body}
      </svg>
    `;
    }

    /**
     * Convert SVG string to HTMLImageElement
     */
    private svgToImage(svgString: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const blob = new Blob([svgString], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);

            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load SVG as image'));
            };

            img.src = url;
        });
    }

    /**
     * Draw an icon on canvas
     * @param ctx - Canvas rendering context
     * @param iconName - Name of the icon
     * @param x - X coordinate (center)
     * @param y - Y coordinate (center)
     * @param size - Size in pixels
     * @param color - Optional color (hex format)
     */
    async drawIcon(
        ctx: CanvasRenderingContext2D,
        iconName: string,
        x: number,
        y: number,
        size: number,
        color?: string
    ): Promise<boolean> {
        const icon = await this.getIcon(iconName, color, size);

        if (!icon) {
            return false;
        }

        ctx.save();
        ctx.translate(x, y);
        ctx.drawImage(icon, -size / 2, -size / 2, size, size);
        ctx.restore();

        return true;
    }

    /**
     * Preload commonly used icons
     */
    async preloadIcons(icons: Array<{ name: string; color?: string; size?: number }>) {
        const promises = icons.map(({ name, color, size }) =>
            this.getIcon(name, color, size || 64)
        );
        await Promise.all(promises);
    }

    /**
     * Clear the cache (useful for memory management)
     */
    clearCache() {
        this.imageCache.clear();
        this.loadingPromises.clear();
    }
}

// Singleton instance
export const iconLoader = new IconLoader();
