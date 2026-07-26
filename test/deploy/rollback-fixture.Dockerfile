FROM busybox:1.37

ARG RELEASE
ARG HEALTHY

RUN printf '%s' "$RELEASE" > /release \
  && printf '%s' "$HEALTHY" > /healthy

CMD ["sh", "-c", "while true; do sleep 3600; done"]
