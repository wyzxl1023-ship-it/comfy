# 生成一个几何占位的分层角色，用来测试 2D 网格变形（真立绘由 ComfyUI 出）
import json, sys
from PIL import Image, ImageDraw
W, H = 1024, 2048
out = sys.argv[1]
def layer(): return Image.new('RGBA', (W, H), (0, 0, 0, 0))
def save(im, n): im.save(f'{out}/{n}')
skin=(250,224,206,255); hair=(52,38,34,255); shirt=(236,232,220,255); skirt=(96,128,160,255); shoe=(245,245,240,255); line=(90,60,50,255)
cx=512
P = dict(canvas=[W,H], headTop=190, neck=[cx,560], shoulderL=[cx-150,640], shoulderR=[cx+150,640], elbowR=[cx+175,950],
         waist=[cx,1080], hem=1380, feet=[cx,1980], eyes=[cx,420], mouth=[cx,500], hairTipY=1050)
# 后发
im=layer(); d=ImageDraw.Draw(im); d.rounded_rectangle([cx-215,230,cx+215,1050], radius=200, fill=hair); save(im,'hair_back.png')
# 身体
im=layer(); d=ImageDraw.Draw(im)
d.rectangle([cx-40,520,cx+40,620], fill=skin)
d.rounded_rectangle([cx-160,600,cx+160,1110], radius=60, fill=shirt, outline=line, width=4)
d.polygon([(cx-170,1080),(cx+170,1080),(cx+230,1380),(cx-230,1380)], fill=skirt, outline=line)
for sx in (-80,80):
    d.rectangle([cx+sx-38,1380,cx+sx+38,1930], fill=skin)
    d.rounded_rectangle([cx+sx-55,1910,cx+sx+55,1985], radius=25, fill=shoe, outline=line, width=4)
save(im,'body.png')
# 手臂
for name, sx, sgn in (('arm_l.png',-150,-1),('arm_r.png',150,1)):
    im=layer(); d=ImageDraw.Draw(im)
    d.rounded_rectangle([cx+sx-45+sgn*10,620,cx+sx+45+sgn*10,1180], radius=40, fill=shirt, outline=line, width=4)
    d.ellipse([cx+sx-40+sgn*14,1150,cx+sx+40+sgn*14,1250], fill=skin, outline=line, width=3)
    save(im,name)
im=layer(); d=ImageDraw.Draw(im)
d.polygon([(cx+120,600),(cx+180,640),(cx+330,500),(cx+280,460)], fill=shirt, outline=line)
d.rounded_rectangle([cx+270,240,cx+340,500], radius=35, fill=shirt, outline=line, width=4)
d.ellipse([cx+255,160,cx+355,260], fill=skin, outline=line, width=3); save(im,'arm_r_wave.png')
# 头
im=layer(); d=ImageDraw.Draw(im); d.ellipse([cx-160,220,cx+160,580], fill=skin, outline=line, width=4)
d.ellipse([cx-180,380,cx-140,450], fill=skin); d.ellipse([cx+140,380,cx+180,450], fill=skin)
d.ellipse([cx-115,465,cx-65,490], fill=(245,180,170,180)); d.ellipse([cx+65,465,cx+115,490], fill=(245,180,170,180))
d.ellipse([cx-70,470,cx-62,478], fill=(80,50,40,255))  # 痣（画面左 = 她的右脸… 测试用）
save(im,'head.png')
def eyes(kind):
    im=layer(); d=ImageDraw.Draw(im)
    for ex in (cx-62, cx+62):
        if kind=='open':
            d.ellipse([ex-28,385,ex+28,455], fill=(255,255,255,255), outline=line, width=4)
            d.ellipse([ex-18,395,ex+18,450], fill=(110,80,64,255)); d.ellipse([ex-6,402,ex+4,414], fill=(255,255,255,255))
        elif kind=='closed': d.arc([ex-30,400,ex+30,440], 20, 160, fill=line, width=6)
        else: d.arc([ex-30,410,ex+30,450], 200, 340, fill=line, width=6)
    return im
save(eyes('open'),'eyes_open.png'); save(eyes('closed'),'eyes_closed.png'); save(eyes('smile'),'eyes_smile.png')
im=layer(); d=ImageDraw.Draw(im)
for ex in (cx-62, cx+62): d.line([ex-30,360,ex+30,352], fill=hair, width=8)
save(im,'brows.png')
def mouth(kind):
    im=layer(); d=ImageDraw.Draw(im)
    if kind=='closed': d.line([cx-20,505,cx+20,505], fill=line, width=5)
    elif kind=='half': d.ellipse([cx-18,495,cx+18,520], fill=(180,80,80,255), outline=line, width=3)
    elif kind=='open': d.ellipse([cx-24,488,cx+24,535], fill=(170,70,70,255), outline=line, width=3)
    else: d.arc([cx-26,480,cx+26,515], 20, 160, fill=line, width=5)
    return im
for k in ('closed','half','open','smile'): save(mouth(k), f'mouth_{k}.png')
im=layer(); d=ImageDraw.Draw(im)
d.chord([cx-175,200,cx+175,520], 180, 360, fill=hair)
d.polygon([(cx-175,360),(cx-120,330),(cx-130,760),(cx-185,740)], fill=hair)
d.polygon([(cx+175,360),(cx+120,330),(cx+130,760),(cx+185,740)], fill=hair)
d.polygon([(cx-60,260),(cx+40,260),(cx-10,380)], fill=hair)
save(im,'hair_front.png')
json.dump(P, open(f'{out}/points.json','w'), ensure_ascii=False, indent=1)
