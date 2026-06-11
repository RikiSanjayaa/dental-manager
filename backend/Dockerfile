FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --default-timeout=120 --no-cache-dir -r requirements.txt

COPY app ./app
RUN mkdir -p data uploads

EXPOSE 8000
