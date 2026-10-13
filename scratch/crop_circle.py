from PIL import Image, ImageDraw

def make_circle_transparent(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    width, height = img.size
    print(f"Image size: {width}x{height}")
    
    # Create a circular mask
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    
    # We want to crop to the circle. Let's find the circle bounds.
    # Let's inspect the pixels to see where the circle starts and ends, or we can assume it's centered
    # and fills most of the image.
    # Typically, the circle is centered.
    center_x, center_y = width // 2, height // 2
    # Let's calculate radius. Since there might be some padding, let's find the first non-white pixel
    # from the edges to estimate the circle boundary, or draw the circle to fit.
    # Let's start with a radius slightly smaller than min(width, height) // 2.
    # Let's inspect the image boundary by running a check.
    
    # Draw circle on mask
    # Let's look at the image pixels from the center outwards to find where the white background begins.
    # Or we can just calculate the radius dynamically:
    # We scan from the top-middle downwards until we find a pixel that is not white (e.g. not close to 255, 255, 255).
    top_edge = 0
    for y in range(height):
        r, g, b, a = img.getpixel((width // 2, y))
        # If it's not white, it's the start of the circle
        if r < 245 or g < 245 or b < 245:
            top_edge = y
            break
            
    bottom_edge = height - 1
    for y in range(height - 1, -1, -1):
        r, g, b, a = img.getpixel((width // 2, y))
        if r < 245 or g < 245 or b < 245:
            bottom_edge = y
            break
            
    left_edge = 0
    for x in range(width):
        r, g, b, a = img.getpixel((x, height // 2))
        if r < 245 or g < 245 or b < 245:
            left_edge = x
            break
            
    right_edge = width - 1
    for x in range(width - 1, -1, -1):
        r, g, b, a = img.getpixel((x, height // 2))
        if r < 245 or g < 245 or b < 245:
            right_edge = x
            break
            
    print(f"Detected circle bounds: left={left_edge}, right={right_edge}, top={top_edge}, bottom={bottom_edge}")
    
    # Calculate radius and center
    rx = (right_edge - left_edge) / 2
    ry = (bottom_edge - top_edge) / 2
    r = min(rx, ry)
    
    cx = left_edge + rx
    cy = top_edge + ry
    
    # Draw a smooth antialiased circular mask
    # To do this, we can draw a white circle on a black mask.
    # We can draw it slightly smaller or exact to avoid any white border.
    # Let's draw with a radius of r - 1 or r - 2 to ensure we don't get white edges.
    r_mask = r - 1
    draw.ellipse([cx - r_mask, cy - r_mask, cx + r_mask, cy + r_mask], fill=255)
    
    # Apply mask
    result = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    result.paste(img, (0, 0), mask=mask)
    
    # Crop to the bounding box of the circle to remove unnecessary transparent padding
    crop_box = (int(cx - r_mask), int(cy - r_mask), int(cx + r_mask), int(cy + r_mask))
    cropped_result = result.crop(crop_box)
    
    cropped_result.save(output_path, "PNG")
    print(f"Saved transparent cropped image to {output_path}")

if __name__ == "__main__":
    import sys
    make_circle_transparent(
        r"C:\Users\HP\.gemini\antigravity-ide\brain\4e2f35d1-0ef9-4d18-9e7b-9c3546b2a3ff\media__1780568668627.png",
        r"c:\Users\HP\Documents\Sankara\New_Project\2 EXAM OPS SYSTEM FOR DOCTORS\Projects\Version Zips\v1.0.2\savprojectv2-version2\artifacts\fellowship-exam\src\assets\golden_jubilee_logo.png"
    )
    # Also overwrite the favicon one
    make_circle_transparent(
        r"C:\Users\HP\.gemini\antigravity-ide\brain\4e2f35d1-0ef9-4d18-9e7b-9c3546b2a3ff\media__1780568668627.png",
        r"c:\Users\HP\Documents\Sankara\New_Project\2 EXAM OPS SYSTEM FOR DOCTORS\Projects\Version Zips\v1.0.2\savprojectv2-version2\artifacts\fellowship-exam\public\favicon.png"
    )
