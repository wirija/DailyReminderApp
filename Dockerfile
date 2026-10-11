FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock \
    && groupadd --gid 10001 planner \
    && useradd --uid 10001 --gid planner --no-create-home planner
COPY --chown=planner:planner backend ./backend
COPY --chown=planner:planner docs ./docs
COPY --chown=planner:planner scripts/build_pwa.py scripts/service-worker.template.js ./scripts/
COPY --chown=planner:planner deploy/entrypoint.sh ./deploy/entrypoint.sh
RUN mkdir -p /data/media /app/backend/staticfiles \
    && chown -R planner:planner /data /app/backend \
    && chmod +x /app/deploy/entrypoint.sh
USER planner
RUN python scripts/build_pwa.py --check \
    && python backend/manage.py collectstatic --noinput
WORKDIR /app/backend
EXPOSE 8000
ENTRYPOINT ["/app/deploy/entrypoint.sh"]
CMD ["web"]
