import sqlite3
import datetime

conn = sqlite3.connect('c:/Users/BH04/.cache/dailyfni/naver-cafe-auto/data/cafe_macro.db')
conn.row_factory = sqlite3.Row

print('=== 스케줄 설정 ===')
try:
    config = conn.execute('SELECT * FROM schedule_config LIMIT 1').fetchone()
    if config:
        for k, v in dict(config).items():
            print(f"{k}: {v}")
    else:
        print('No config found')
except Exception as e:
    print('Error reading schedule_config:', e)

print('\n=== 오늘 스케줄 엔진 현재 오프셋 및 예정 시간 시뮬레이션 ===')
if config:
    daily_shift = config['daily_shift_minutes'] or 0
    base_h = config['base_start_hour'] or 0
    base_m = config['base_start_minute'] or 0
    times = config['times'] # ex: '15:01'
    
    print(f"times 설정값: {times}")
    
    if daily_shift > 0:
        day_index = datetime.datetime.now().timetuple().tm_yday
        max_shift = 4 * 60
        cycle = max(1, max_shift // max(1, daily_shift))
        offset = (day_index % cycle) * daily_shift
        print(f"오늘의 누적 지연시간: {offset}분")
        
        # Calculate actual today's time if base time is provided
        if times:
            t = times.split(',')
            for tm in t:
                try:
                    h, m = map(int, tm.split(':'))
                    actual_time = datetime.datetime.now().replace(hour=h, minute=m, second=0) + datetime.timedelta(minutes=offset)
                    print(f"예상 실제 스케줄 작동 시간: {actual_time.strftime('%H:%M:%S')}")
                except:
                    pass
    else:
        print("일별 지연 없음. 정해진 시간에 작동 예정.")
        
conn.close()

with open('c:/Users/BH04/.cache/dailyfni/naver-cafe-auto/logs/app.log', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()
    print('\n=== 가장 최근 로그 내역 20줄 ===')
    for line in lines[-20:]:
        print(line.strip())
