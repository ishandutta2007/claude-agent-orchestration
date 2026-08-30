import math
from PIL import Image, ImageDraw, ImageFont

WIDTH = 640
HEIGHT = 320
FRAMES_COUNT = 30
PADDING_Y = 50

# Load default font or try to load a nice truetype font if available
try:
    font_title = ImageFont.truetype("arialbd.ttf", 32)
    font_sub = ImageFont.truetype("arial.ttf", 14)
    font_badge = ImageFont.truetype("consola.ttf", 11)
    font_tag = ImageFont.truetype("consolab.ttf", 10)
except Exception:
    font_title = ImageFont.load_default()
    font_sub = ImageFont.load_default()
    font_badge = ImageFont.load_default()
    font_tag = ImageFont.load_default()

frames = []

nodes = [
    {"x": 480, "y": 160, "r": 12, "color": (56, 189, 248), "name": "queen", "is_queen": True},
    {"x": 410, "y": 105, "r": 7, "color": (56, 189, 248), "name": "sec"},
    {"x": 560, "y": 110, "r": 7, "color": (192, 132, 252), "name": "core"},
    {"x": 420, "y": 215, "r": 7, "color": (129, 140, 248), "name": "integ"},
    {"x": 565, "y": 210, "r": 7, "color": (52, 211, 153), "name": "qa"},
    {"x": 490, "y": 80, "r": 6, "color": (244, 114, 182), "name": "perf"},
    {"x": 490, "y": 240, "r": 6, "color": (251, 191, 36), "name": "rel"},
    # satellite micro-nodes
    {"x": 370, "y": 90, "r": 3, "color": (56, 189, 248), "name": "s1"},
    {"x": 375, "y": 140, "r": 3, "color": (56, 189, 248), "name": "s2"},
    {"x": 605, "y": 90, "r": 3, "color": (192, 132, 252), "name": "s3"},
    {"x": 610, "y": 150, "r": 3, "color": (192, 132, 252), "name": "s4"},
    {"x": 380, "y": 230, "r": 3, "color": (129, 140, 248), "name": "s5"},
    {"x": 605, "y": 230, "r": 3, "color": (52, 211, 153), "name": "s6"},
]

connections = [
    (0, 1), (0, 2), (0, 3), (0, 4), (0, 5), (0, 6),
    (1, 2), (2, 4), (4, 6), (6, 3), (3, 1), (1, 5), (2, 5),
    (1, 7), (1, 8), (2, 9), (2, 10), (3, 11), (4, 12)
]

for frame_idx in range(FRAMES_COUNT):
    progress = frame_idx / FRAMES_COUNT
    img = Image.new("RGBA", (WIDTH, HEIGHT), (9, 13, 22, 255))
    draw = ImageDraw.Draw(img)

    # 1. Subtle background grid (content safe zone: y=50..270)
    for x in range(0, WIDTH, 40):
        draw.line([(x, 0), (x, HEIGHT)], fill=(20, 30, 48, 120), width=1)
    for y in range(0, HEIGHT, 35):
        draw.line([(0, y), (WIDTH, y)], fill=(20, 30, 48, 120), width=1)

    # Gradient background glow orbs
    # Left ambient glow
    glow_pulse = math.sin(progress * 2 * math.pi) * 0.2 + 0.8
    # Center-right glow around queen
    for r_glow in range(90, 10, -15):
        alpha = int(14 * glow_pulse * (1 - r_glow / 90))
        draw.ellipse([480 - r_glow, 160 - r_glow, 480 + r_glow, 160 + r_glow], fill=(56, 189, 248, alpha))

    # 2. Draw connections with animated energy flow
    for idx, (i1, i2) in enumerate(connections):
        n1 = nodes[i1]
        n2 = nodes[i2]
        
        # Base line
        draw.line([(n1["x"], n1["y"]), (n2["x"], n2["y"])], fill=(40, 55, 80, 160), width=1)
        
        # Energy pulse packet traveling along line
        travel_prog = (progress + (idx * 0.13)) % 1.0
        px = int(n1["x"] + (n2["x"] - n1["x"]) * travel_prog)
        py = int(n1["y"] + (n2["y"] - n1["y"]) * travel_prog)
        draw.ellipse([px - 2, py - 2, px + 2, py + 2], fill=(129, 210, 254, 230))

    # 3. Beacon expanding rings around Queen Node (0)
    for ring_i in range(2):
        ring_prog = (progress + ring_i * 0.5) % 1.0
        ring_r = int(10 + ring_prog * 35)
        ring_alpha = int(220 * (1 - ring_prog))
        draw.ellipse(
            [nodes[0]["x"] - ring_r, nodes[0]["y"] - ring_r, nodes[0]["x"] + ring_r, nodes[0]["y"] + ring_r],
            outline=(56, 189, 248, ring_alpha),
            width=1
        )

    # 4. Draw Swarm Nodes
    for i, node in enumerate(nodes):
        # Subtle floating motion
        float_y = math.sin(progress * 2 * math.pi + i) * 3
        nx = node["x"]
        ny = node["y"] + float_y
        r = node["r"]
        
        if node.get("is_queen"):
            # Queen outer ring
            draw.ellipse([nx - r - 4, ny - r - 4, nx + r + 4, ny + r + 4], fill=(15, 23, 42, 255), outline=(56, 189, 248, 255), width=2)
            draw.ellipse([nx - r, ny - r, nx + r, ny + r], fill=(14, 165, 233, 255))
            # Center star/core
            draw.ellipse([nx - 3, ny - 3, nx + 3, ny + 3], fill=(255, 255, 255, 255))
        else:
            c = node["color"]
            draw.ellipse([nx - r - 2, ny - r - 2, nx + r + 2, ny + r + 2], fill=(15, 23, 42, 255), outline=c, width=1)
            draw.ellipse([nx - r + 1, ny - r + 1, nx + r - 1, ny + r - 1], fill=c)

    # 5. LEFT TYPOGRAPHY (Vertical safe zone within 50px..270px)
    # Top badge pill
    badge_y = 62
    draw.rounded_rectangle([40, badge_y, 230, badge_y + 22], radius=11, fill=(15, 23, 42, 220), outline=(56, 189, 248, 160), width=1)
    # Pulsing green/cyan indicator
    dot_color = (56, 189, 248, int(180 + 75 * math.sin(progress * 2 * math.pi)))
    draw.ellipse([50, badge_y + 7, 58, badge_y + 15], fill=dot_color)
    draw.text((64, badge_y + 4), "AI SWARM FRAMEWORK", font=font_badge, fill=(125, 211, 252, 255))

    # Main Title
    title_y = 96
    # Title shadow / glow
    draw.text((41, title_y + 1), "CLAUDE-FLOW V3", font=font_title, fill=(30, 58, 138, 160))
    draw.text((40, title_y), "CLAUDE-FLOW V3", font=font_title, fill=(240, 249, 255, 255))

    # Subtitle
    sub_y = 138
    draw.text((40, sub_y), "Autonomous Multi-Agent Orchestration", font=font_sub, fill=(148, 163, 184, 255))

    # Feature Tag Pills
    pills = [
        {"text": "⚡ 15-AGENT MESH", "fill": (30, 27, 75, 230), "stroke": (99, 102, 241, 200), "text_color": (199, 210, 254)},
        {"text": "🔌 MCP PROTOCOL", "fill": (12, 74, 110, 230), "stroke": (2, 132, 199, 200), "text_color": (186, 230, 253)},
        {"text": "🧠 HNSW MEMORY", "fill": (46, 16, 101, 230), "stroke": (147, 51, 234, 200), "text_color": (233, 213, 255)},
    ]

    pill_x = 40
    pill_y = 175
    for p in pills:
        pill_w = len(p["text"]) * 7 + 16
        draw.rounded_rectangle([pill_x, pill_y, pill_x + pill_w, pill_y + 24], radius=6, fill=p["fill"], outline=p["stroke"], width=1)
        draw.text((pill_x + 8, pill_y + 5), p["text"], font=font_tag, fill=p["text_color"])
        pill_x += pill_w + 8

    # Bottom Specs line
    spec_y = 220
    specs_text = "● DDD Architecture   ● London School TDD   ● <100ms Latency"
    draw.text((40, spec_y), specs_text, font=font_badge, fill=(100, 116, 139, 255))

    # Outer decorative border
    draw.rectangle([1, 1, WIDTH - 2, HEIGHT - 2], outline=(56, 189, 248, 60), width=1)

    # Convert to P-mode with palette for compact GIF
    p_img = img.convert("RGB").convert("P", palette=Image.ADAPTIVE, colors=128)
    frames.append(p_img)

# Save animated GIF
frames[0].save(
    "assets/social-preview.gif",
    save_all=True,
    append_images=frames[1:],
    duration=65,
    loop=0,
    optimize=True
)

print("GIF generated successfully at assets/social-preview.gif")
