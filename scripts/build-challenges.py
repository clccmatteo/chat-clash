"""Rebuild the hand-authored bilingual challenge library; never used at runtime."""
import json
from pathlib import Path

out = []
def add(kind, en, it, answers, emote=None):
    item = {'id': f'{kind}-{sum(c["type"] == kind for c in out)+1:03}', 'type': kind,
            'prompt': {'en': en, 'it': it}, 'answers': answers}
    if emote: item['emote'] = emote
    out.append(item)

trivia = [
('Which keyboard key usually opens a PC game’s pause menu?', 'Quale tasto apre di solito il menu di pausa in un gioco per PC?', ['escape','esc']),
('What three letters describe a character controlled by the game rather than a player?', 'Quali tre lettere indicano un personaggio controllato dal gioco anziché da un giocatore?', ['NPC']),
('In chat, what two letters stand for “good game”?', 'In chat, quali due lettere significano “good game”?', ['GG']),
('What three letters mean “away from keyboard”?', 'Quali tre lettere significano “lontano dalla tastiera”?', ['AFK']),
('What is the smallest individual picture element on a screen called?', 'Come si chiama il più piccolo elemento di un’immagine sullo schermo?', ['pixel']),
('What is the gaming term for completing a game as fast as possible?', 'Come si chiama il completamento di un gioco nel minor tempo possibile?', ['speedrun','speedrunning']),
('A classic six-sided die has how many faces?', 'Quante facce ha un dado classico?', ['6','six','sei']),
('How many squares are on a standard chessboard?', 'Quante caselle ha una scacchiera standard?', ['64','sixty four','sessantaquattro']),
('Which chess piece moves in an L shape?', 'Quale pezzo degli scacchi si muove a L?', ['knight','cavallo']),
('In chess, which piece must you checkmate to win?', 'Negli scacchi, quale pezzo devi mettere sotto scacco matto per vincere?', ['king','re']),
('What does the P in FPS stand for when measuring rendering speed?', 'Cosa significa la P di FPS quando si misura la velocità delle immagini?', ['per']),
('In RGB, which color is represented by B?', 'In RGB, quale colore rappresenta la B?', ['blue','blu']),
('How many primary light colors are combined in RGB?', 'Quanti colori primari della luce combina il sistema RGB?', ['3','three','tre']),
('What decimal number does binary 10 represent?', 'Quale numero decimale rappresenta il numero binario 10?', ['2','two','due']),
('What number does the Roman numeral X represent?', 'Quale numero rappresenta il numero romano X?', ['10','ten','dieci']),
('What is the name for a secret hidden reference in a game?', 'Come si chiama un riferimento segreto nascosto in un gioco?', ['easter egg']),
('What computer accessory moves the pointer when you slide it across a desk?', 'Quale accessorio sposta il puntatore quando lo fai scorrere sulla scrivania?', ['mouse']),
('What keyboard key inserts a blank space between words?', 'Quale tasto inserisce uno spazio vuoto tra le parole?', ['space','spacebar','spazio','barra spaziatrice']),
('What symbol begins a hashtag?', 'Quale simbolo apre un hashtag?', ['#','hash','cancelletto']),
('What symbol separates the username and domain in an email address?', 'Quale simbolo separa il nome utente e il dominio in un indirizzo email?', ['@','at','chiocciola']),
('What does the W in WWW stand for?', 'Quale parola rappresenta la W in WWW?', ['world','wide','web']),
('What English word describes a repeating animated image with the file extension .gif?', 'Quale sigla identifica un’immagine animata con estensione .gif?', ['GIF']),
('What is the term for a small preview image for a video?', 'Come si chiama la piccola immagine di anteprima di un video?', ['thumbnail','miniatura']),
('How many minutes are in a quarter of an hour?', 'Quanti minuti ci sono in un quarto d’ora?', ['15','fifteen','quindici']),
('What shape has three sides?', 'Quale figura geometrica ha tre lati?', ['triangle','triangolo']),
('How many sides does a hexagon have?', 'Quanti lati ha un esagono?', ['6','six','sei']),
('Which planet is nicknamed the Red Planet?', 'Quale pianeta è soprannominato il pianeta rosso?', ['Mars','Marte']),
('What is the largest ocean on Earth?', 'Qual è l’oceano più grande della Terra?', ['Pacific','Pacific Ocean','Pacifico','Oceano Pacifico']),
('What is the chemical formula for water?', 'Qual è la formula chimica dell’acqua?', ['H2O','H₂O']),
('What is the capital of Italy?', 'Qual è la capitale d’Italia?', ['Rome','Roma']),
('What is the capital of Japan?', 'Qual è la capitale del Giappone?', ['Tokyo','Tokio']),
('How many strings does a standard guitar have?', 'Quante corde ha una chitarra standard?', ['6','six','sei']),
('What instrument has black and white keys and is played with both hands?', 'Quale strumento ha tasti bianchi e neri e si suona con entrambe le mani?', ['piano','pianoforte']),
('Which animal is famous for changing color and has a long sticky tongue?', 'Quale animale è famoso per cambiare colore e ha una lunga lingua appiccicosa?', ['chameleon','camaleonte']),
('What do bees make from flower nectar?', 'Cosa producono le api dal nettare dei fiori?', ['honey','miele']),
('How many legs does a spider have?', 'Quante zampe ha un ragno?', ['8','eight','otto']),
('What season comes immediately after summer?', 'Quale stagione viene subito dopo l’estate?', ['autumn','fall','autunno']),
('Which direction is opposite to north?', 'Quale direzione è opposta al nord?', ['south','sud']),
('What is frozen water called?', 'Come si chiama l’acqua allo stato solido?', ['ice','ghiaccio']),
('What is the name of the star at the center of our solar system?', 'Come si chiama la stella al centro del nostro sistema solare?', ['Sun','the Sun','Sole','il Sole']),
]
for en,it,answers in trivia: add('trivia',en,it,answers)

words = [('portal','English','inglese'),('dragon','English','inglese'),('stream','English','inglese'),('rocket','English','inglese'),('planet','English','inglese'),('castle','English','inglese'),('puzzle','English','inglese'),('shield','English','inglese'),('wizard','English','inglese'),('button','English','inglese'),('camera','English','inglese'),('silver','English','inglese'),('forest','English','inglese'),('victory','English','inglese'),('thunder','English','inglese'),('drago','Italian','italiana'),('nuvola','Italian','italiana'),('stella','Italian','italiana'),('schermo','Italian','italiana'),('tastiera','Italian','italiana'),('squadra','Italian','italiana'),('sfida','Italian','italiana'),('fuoco','Italian','italiana'),('vittoria','Italian','italiana'),('fulmine','Italian','italiana'),('tesoro','Italian','italiana'),('castello','Italian','italiana'),('foresta','Italian','italiana'),('magia','Italian','italiana'),('lancio','Italian','italiana')]
for word,en_lang,it_lang in words:
    scrambled = word[2:] + word[:2]
    add('anagram',f'Unscramble this {en_lang} word: {scrambled.upper()}',f'Riordina questa parola {it_lang}: {scrambled.upper()}',[word])

maths = [
('17 + 26',43),('81 - 37',44),('8 × 7',56),('96 ÷ 8',12),('14 + 19 + 7',40),
('(9 + 3) × 4',48),('100 - 6 × 8',52),('7 × 7 + 1',50),('144 ÷ 12',12),('3 × (18 - 5)',39),
('25 + 25 + 25',75),('90 ÷ 5 + 2',20),('11 × 11',121),('200 - 123',77),('6 × 9 - 4',50),
('(42 + 18) ÷ 6',10),('15 × 4 + 3',63),('72 ÷ 9 + 11',19),('13 + 28 - 9',32),('5 × (7 + 8)',75),
('64 ÷ 4 - 3',13),('99 - 11 × 3',66),('(16 - 7) × 6',54),('2 × 3 × 7',42),('120 ÷ 10 + 8',20),
('18 + 18 + 18',54),('7 × 12 - 10',74),('(55 - 5) ÷ 5',10),('31 + 24 + 15',70),('9 × 8 - 17',55)
]
for expression,result in maths: add('math',f'Quick math: {expression} = ?',f'Calcolo lampo: {expression} = ?',[str(result)])

phrases = [
('chat takes the crown','la chat conquista la corona'),('tiny pixels big energy','piccoli pixel grande energia'),('one crew one dream','una squadra un sogno'),('the bar goes brr','la barra prende il volo'),('mint condition','menta in forma'),('coral comeback','rimonta corallo'),('keyboard confetti','coriandoli da tastiera'),('power to the chat','potere alla chat'),('every voice counts','ogni voce conta'),('spark the clash','accendi la sfida'),('full combo unlocked','combo completa sbloccata'),('we brought the hype','abbiamo portato la carica'),('no sleepy pixels','nessun pixel assonnato'),('press play together','premiamo play insieme'),('rally the crew','raduna la squadra'),('the comeback club','il club delle rimonte'),('three two chat','tre due chat'),('more noise more points','più voci più punti'),('ready set clash','pronti partenza sfida'),('little spark big clash','piccola scintilla grande sfida'),('send the good vibes','manda le vibrazioni positive'),('teamwork makes sparks','la squadra fa scintille'),('champions in the chat','campioni nella chat'),('keep the combo alive','tieni viva la combo'),('the final push','la spinta finale'),('hype has entered chat','la carica entra in chat'),('a very loud hello','un saluto molto forte'),('victory tastes like pixels','la vittoria sa di pixel'),('community over coins','la comunità prima delle monete'),('see you at the finish','ci vediamo al traguardo')]
for en,it in phrases: add('type-race',f'Type race! First to type: {en}',f'Gara di scrittura! Scrivi per primo: {it}',[en,it])

emotes = ['CLASH','SPARK','HYPE','CHEER','BOOST','RALLY','GG','WAVE','FIRE','STAR','COMBO','GO','WOW','POWER','CREW','VIBE','BOOM','PUSH','GLOW','ZIP','POP','ZAP','BOLT','WIN','LOUD','NICE','EPIC','JUMP','DASH','ROAR']
for emote in emotes: add('emote-target',f'Emote rally! First team with 10 different users sending {emote} within 10 seconds wins.',f'Raduno emote! Vince la prima squadra con 10 utenti diversi che inviano {emote} entro 10 secondi.',[],emote)

root = Path(__file__).resolve().parent.parent
(root/'data/challenges.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(f'Wrote {len(out)} original bilingual challenges')
