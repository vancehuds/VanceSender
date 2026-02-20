import math
from PIL import Image, ImageDraw

def draw_icon(size=256):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = 16
    draw.rounded_rectangle(
        [(margin, margin), (size - margin, size - margin)],
        radius=48,
        fill=(30, 41, 59, 255),  # #1e293b
        outline=(56, 189, 248, 255), # #38bdf8
        width=8
    )

    draw.polygon([(180, 76), (76, 128), (116, 140)], fill=(56, 189, 248, 255))
    draw.polygon([(180, 76), (116, 140), (128, 180)], fill=(125, 211, 252, 255))
    draw.polygon([(116, 140), (128, 180), (110, 160)], fill=(2, 132, 199, 255))

    img.save("icon.png")
    img.save("app/web/favicon.ico", format="ICO", sizes=[(16,16), (32,32), (48,48), (64,64), (128,128), (256,256)])
    img.save("icon.ico", format="ICO", sizes=[(16,16), (32,32), (48,48), (64,64), (128,128), (256,256)])
    print("Icons generated successfully!")

if __name__ == "__main__":
    draw_icon()
